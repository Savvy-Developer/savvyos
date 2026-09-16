#!/usr/bin/env python3
"""Import a Pulse Team Tyler Markdown export into SavvyOS Projects.

The command is deliberately idempotent. A task is matched by the stable
"Pulse source ID: #<id>" line written to its task details, so a retry cannot
duplicate prior imports.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime, time
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

import pymysql

SOURCE_TIMEZONE = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")
PROJECT_TITLE = "Team Tyler Deliverables"
PROJECT_OWNER_ID = 1
PREFERRED_SOURCE_USER_IDS = {
    "tyler coon": PROJECT_OWNER_ID,
}


class HtmlText(HTMLParser):
    """Small, dependency-free HTML-to-plain-text formatter for export notes."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"p", "div", "br", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")
        elif tag == "li":
            self.parts.append("\n- ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"p", "div", "li", "ul", "ol", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        value = "".join(self.parts).replace("\xa0", " ")
        value = re.sub(r"[ \t]+", " ", value)
        value = re.sub(r" *\n *", "\n", value)
        value = re.sub(r"\n{3,}", "\n\n", value)
        return value.strip()


def html_to_text(value: str) -> str:
    if not value or value.strip() in {"—", "-"}:
        return ""
    parser = HtmlText()
    parser.feed(html.unescape(value))
    parser.close()
    return parser.text()


def split_markdown_row(line: str) -> list[str]:
    """Split a Markdown table row without breaking escaped pipes."""
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    cells: list[str] = []
    current: list[str] = []
    escaped = False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == "|":
            cells.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if escaped:
        current.append("\\")
    cells.append("".join(current).strip())
    return cells


def is_separator_row(line: str) -> bool:
    cells = split_markdown_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells)


def clean_cell(value: str) -> str:
    value = html.unescape(value).strip()
    return "" if value in {"—", "-"} else value


def parse_date(value: str | None) -> datetime | None:
    value = clean_cell(value or "")
    if not value:
        return None
    parsed = datetime.strptime(value, "%b %d, %Y")
    local = datetime.combine(parsed.date(), time(12, 0), tzinfo=SOURCE_TIMEZONE)
    return local.astimezone(UTC).replace(tzinfo=None)


def parse_timestamp(value: str | None) -> datetime | None:
    value = clean_cell(value or "")
    if not value:
        return None
    parsed = datetime.strptime(value, "%b %d, %Y, %I:%M %p")
    return parsed.replace(tzinfo=SOURCE_TIMEZONE).astimezone(UTC).replace(tzinfo=None)


def source_display_time(value: datetime | None) -> str:
    if not value:
        return "Not recorded"
    return value.replace(tzinfo=UTC).astimezone(SOURCE_TIMEZONE).strftime("%b %-d, %Y, %-I:%M %p ET")


@dataclass
class Comment:
    when: datetime
    author: str
    content: str
    edited: str = ""


@dataclass
class Activity:
    when: datetime
    action: str
    actor: str
    status: str
    note: str
    blocked_by: str


@dataclass
class Todo:
    source_id: str
    title: str
    section: str
    owner: str
    priority: str
    status: str
    due_date: datetime | None
    created_by: str
    created_at: datetime
    completed_at: datetime | None
    recurrence: str
    context: str
    description: str
    comments: list[Comment] = field(default_factory=list)
    activity: list[Activity] = field(default_factory=list)


def parse_info_table(lines: list[str], completed_section: bool) -> dict[str, str]:
    for index, line in enumerate(lines):
        if not line.startswith("| Owner | Priority |"):
            continue
        if index + 2 >= len(lines) or not is_separator_row(lines[index + 1]):
            continue
        headers = split_markdown_row(line)
        values = split_markdown_row(lines[index + 2])
        if len(values) < len(headers):
            raise ValueError(f"Incomplete primary table row: {lines[index + 2]}")
        return {header.strip(): clean_cell(values[position]) for position, header in enumerate(headers)}
    section_name = "completed" if completed_section else "open"
    raise ValueError(f"Missing primary metadata table for {section_name} todo")


def parse_comments(lines: list[str]) -> list[Comment]:
    comments: list[Comment] = []
    for index, line in enumerate(lines):
        if line.strip() != "| When | By | Comment | Edited |":
            continue
        cursor = index + 2
        while cursor < len(lines) and lines[cursor].startswith("|"):
            values = split_markdown_row(lines[cursor])
            if len(values) >= 4:
                comments.append(Comment(
                    when=parse_timestamp(values[0]) or datetime.now(),
                    author=clean_cell(values[1]),
                    content=html_to_text(values[2]),
                    edited=clean_cell(values[3]),
                ))
            cursor += 1
        break
    return comments


def parse_activity(lines: list[str]) -> list[Activity]:
    activity: list[Activity] = []
    for index, line in enumerate(lines):
        if line.strip() != "| When | Action | By | Status | Note / definition of done | Blocked By |":
            continue
        cursor = index + 2
        while cursor < len(lines) and lines[cursor].startswith("|"):
            values = split_markdown_row(lines[cursor])
            if len(values) >= 6:
                activity.append(Activity(
                    when=parse_timestamp(values[0]) or datetime.now(),
                    action=clean_cell(values[1]),
                    actor=clean_cell(values[2]),
                    status=clean_cell(values[3]),
                    note=html_to_text(values[4]),
                    blocked_by=clean_cell(values[5]),
                ))
            cursor += 1
        break
    return activity


def find_description(lines: list[str]) -> str:
    for line in lines:
        match = re.match(r"\*\*Description / notes:\*\*\s*(.*)$", line)
        if match:
            return html_to_text(match.group(1))
    return ""


def parse_export(path: Path) -> list[Todo]:
    content = path.read_text(encoding="utf-8")
    section_pattern = re.compile(r"^# (Open|Completed) To-Dos\s*$", re.MULTILINE)
    sections = list(section_pattern.finditer(content))
    if len(sections) != 2:
        raise ValueError("Expected exactly Open To-Dos and Completed To-Dos sections")

    todos: list[Todo] = []
    for section_index, section_match in enumerate(sections):
        section_name = section_match.group(1)
        start = section_match.end()
        end = sections[section_index + 1].start() if section_index + 1 < len(sections) else len(content)
        section_content = content[start:end]
        heading_pattern = re.compile(r"^## #(\d+) · (.+?)\s*$", re.MULTILINE)
        headings = list(heading_pattern.finditer(section_content))
        for heading_index, heading in enumerate(headings):
            block_start = heading.end()
            block_end = headings[heading_index + 1].start() if heading_index + 1 < len(headings) else len(section_content)
            block_lines = section_content[block_start:block_end].splitlines()
            completed_section = section_name == "Completed"
            metadata = parse_info_table(block_lines, completed_section)
            owner = metadata.get("Owner", "")
            priority = metadata.get("Priority", "medium").lower()
            if priority not in {"high", "medium", "low"}:
                priority = "medium"
            completed_at = parse_timestamp(metadata.get("Completed")) if completed_section else None
            status = "Completed" if completed_section else metadata.get("Status", "Not Started")
            created_at = parse_timestamp(metadata.get("Created"))
            if not created_at:
                raise ValueError(f"Missing created timestamp for Pulse #{heading.group(1)}")
            todo = Todo(
                source_id=heading.group(1),
                title=heading.group(2).strip(),
                section=section_name,
                owner=owner,
                priority=priority,
                status=status,
                due_date=parse_date(metadata.get("Due Date")),
                created_by=metadata.get("Created By", ""),
                created_at=created_at,
                completed_at=completed_at,
                recurrence=metadata.get("Recurring", "No"),
                context=metadata.get("Context", ""),
                description=find_description(block_lines),
                comments=parse_comments(block_lines),
                activity=parse_activity(block_lines),
            )
            todos.append(todo)

    seen = [todo.source_id for todo in todos]
    duplicates = [source_id for source_id, count in Counter(seen).items() if count > 1]
    if duplicates:
        raise ValueError(f"Duplicate Pulse source IDs: {', '.join(duplicates)}")
    return todos


def detail_text(todo: Todo) -> str:
    chunks = [
        f"Pulse source ID: #{todo.source_id}",
        f"Source status: {todo.status}",
        f"Source context: {todo.context or 'Team Tyler'}",
        f"Recurring: {todo.recurrence or 'No'}",
        f"Originally created by: {todo.created_by or 'Not recorded'} on {source_display_time(todo.created_at)}",
    ]
    if todo.completed_at:
        chunks.append(f"Completed in Pulse: {source_display_time(todo.completed_at)}")
    if todo.description:
        chunks.extend(["", todo.description])
    return "\n".join(chunks).strip()


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def get_connection() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=os.environ["SAVVYOS_DB_HOST"],
        port=int(os.environ.get("SAVVYOS_DB_PORT", "23137")),
        user=os.environ.get("SAVVYOS_DB_USER", "root"),
        password=os.environ["SAVVYOS_DB_PASSWORD"],
        database=os.environ.get("SAVVYOS_DB_NAME", "railway"),
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def resolve_users(connection: pymysql.connections.Connection, names: Iterable[str]) -> tuple[dict[str, int], list[str]]:
    requested = sorted({name.strip() for name in names if name and name.strip()})
    if not requested:
        return {}, []
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, name FROM users WHERE isActive = 1")
        users = cursor.fetchall()
    normalized_users = [(int(user["id"]), user["name"] or "", normalize_name(user["name"] or "")) for user in users]
    mapping: dict[str, int] = {}
    unmapped: list[str] = []
    for source_name in requested:
        normalized_source = normalize_name(source_name)
        if normalized_source in PREFERRED_SOURCE_USER_IDS:
            mapping[normalized_source] = PREFERRED_SOURCE_USER_IDS[normalized_source]
            continue
        exact = [user_id for user_id, _name, normalized_user in normalized_users if normalized_user == normalized_source]
        prefix = [user_id for user_id, _name, normalized_user in normalized_users if normalized_user.startswith(normalized_source + " ")]
        if len(exact) == 1:
            mapping[normalized_source] = exact[0]
        elif len(prefix) == 1:
            mapping[normalized_source] = prefix[0]
        else:
            unmapped.append(source_name)
    return mapping, unmapped


def source_action_to_pm_action(source_action: str) -> str:
    value = normalize_name(source_action)
    if value == "created":
        return "task_created"
    if value == "completed":
        return "task_completed"
    if value in {"reopened", "re-opened"}:
        return "task_reopened"
    return "task_updated"


def source_activity_detail(todo: Todo, activity: Activity) -> str:
    details = [f"Imported from Pulse #{todo.source_id}", f"Source action: {activity.action or 'Not recorded'}"]
    if activity.status:
        details.append(f"Status: {activity.status}")
    if activity.note:
        details.append(f"Definition of done: {activity.note}")
    if activity.blocked_by:
        details.append(f"Blocked by: {activity.blocked_by}")
    return "\n".join(details)


def existing_source_ids(connection: pymysql.connections.Connection, project_id: int) -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT notes FROM pm_tasks WHERE projectId = %s AND notes LIKE 'Pulse source ID: #%%'",
            (project_id,),
        )
        rows = cursor.fetchall()
    result: set[str] = set()
    for row in rows:
        match = re.search(r"^Pulse source ID: #(\d+)", row.get("notes") or "", re.MULTILINE)
        if match:
            result.add(match.group(1))
    return result


def get_project(connection: pymysql.connections.Connection) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, title FROM pm_projects WHERE title = %s AND archivedAt IS NULL ORDER BY id DESC LIMIT 1",
            (PROJECT_TITLE,),
        )
        project = cursor.fetchone()
    if not project:
        raise RuntimeError(f'Active project "{PROJECT_TITLE}" was not found')
    return project


def get_or_create_sections(connection: pymysql.connections.Connection, project_id: int) -> dict[str, int]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, title FROM pm_todo_sections WHERE projectId = %s", (project_id,))
        existing = {row["title"]: int(row["id"]) for row in cursor.fetchall()}
        cursor.execute("SELECT COALESCE(MAX(sortOrder), -1) AS max_sort_order FROM pm_todo_sections WHERE projectId = %s", (project_id,))
        next_sort_order = int(cursor.fetchone()["max_sort_order"]) + 1
        for title in ("Open To-Dos", "Completed To-Dos"):
            if title not in existing:
                cursor.execute(
                    "INSERT INTO pm_todo_sections (projectId, title, dueDate, sortOrder, createdAt, updatedAt) VALUES (%s, %s, NULL, %s, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                    (project_id, title, next_sort_order),
                )
                existing[title] = int(cursor.lastrowid)
                next_sort_order += 1
    return existing


def import_todos(connection: pymysql.connections.Connection, todos: list[Todo], user_map: dict[str, int], allow_unmapped: bool) -> dict:
    project = get_project(connection)
    project_id = int(project["id"])
    existing = existing_source_ids(connection, project_id)
    to_insert = [todo for todo in todos if todo.source_id not in existing]
    all_names = {todo.owner for todo in to_insert}
    for todo in to_insert:
        all_names.add(todo.created_by)
        all_names.update(comment.author for comment in todo.comments)
        all_names.update(activity.actor for activity in todo.activity)
    unresolved = sorted(name for name in all_names if name and normalize_name(name) not in user_map)
    owner_unresolved = sorted({todo.owner for todo in to_insert if todo.owner and normalize_name(todo.owner) not in user_map})
    if owner_unresolved:
        raise RuntimeError(f"Cannot assign these task owners because no active SavvyOS account was found: {', '.join(owner_unresolved)}")
    if unresolved and not allow_unmapped:
        raise RuntimeError("Unmapped source people found. Re-run with --allow-unmapped only after review: " + ", ".join(unresolved))

    sections = get_or_create_sections(connection, project_id)
    task_count = comment_count = activity_count = fallback_comment_count = 0
    created_ids: list[int] = []
    with connection.cursor() as cursor:
        for order, todo in enumerate(to_insert):
            owner_id = user_map[normalize_name(todo.owner)]
            due_date = todo.due_date
            cursor.execute(
                """
                INSERT INTO pm_tasks
                    (projectId, parentTaskId, sectionId, title, ownerId, dueDate, priority, completed, completedAt, notes, sortOrder, createdAt, updatedAt)
                VALUES
                    (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, UTC_TIMESTAMP())
                """,
                (
                    project_id,
                    sections[f"{todo.section} To-Dos"],
                    todo.title,
                    owner_id,
                    due_date,
                    todo.priority,
                    todo.section == "Completed",
                    todo.completed_at,
                    detail_text(todo),
                    order,
                    todo.created_at,
                ),
            )
            task_id = int(cursor.lastrowid)
            created_ids.append(task_id)
            task_count += 1

            for comment in todo.comments:
                author_id = user_map.get(normalize_name(comment.author))
                content = comment.content
                if not author_id:
                    author_id = PROJECT_OWNER_ID
                    content = f"Original Pulse author: {comment.author or 'Not recorded'}\n\n{content}"
                    fallback_comment_count += 1
                if comment.edited:
                    content += f"\n\nPulse edited: {comment.edited}"
                cursor.execute(
                    "INSERT INTO pm_task_comments (taskId, authorId, content, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s)",
                    (task_id, author_id, content, comment.when, comment.when),
                )
                comment_count += 1

            history = todo.activity or [Activity(
                when=todo.created_at,
                action="Created",
                actor=todo.created_by,
                status=todo.status,
                note="",
                blocked_by="",
            )]
            for entry in history:
                cursor.execute(
                    "INSERT INTO pm_project_activity (projectId, taskId, actorId, action, detail, createdAt) VALUES (%s, %s, %s, %s, %s, %s)",
                    (
                        project_id,
                        task_id,
                        user_map.get(normalize_name(entry.actor)),
                        source_action_to_pm_action(entry.action),
                        source_activity_detail(todo, entry),
                        entry.when,
                    ),
                )
                activity_count += 1

        if to_insert:
            cursor.execute(
                "INSERT INTO pm_project_activity (projectId, taskId, actorId, action, detail, createdAt) VALUES (%s, NULL, %s, 'project_updated', %s, UTC_TIMESTAMP())",
                (
                    project_id,
                    PROJECT_OWNER_ID,
                    f"Imported {task_count} Team Tyler Pulse to-dos, including {comment_count} comments and {activity_count} historical activity entries.",
                ),
            )
    return {
        "project_id": project_id,
        "skipped_existing": len(existing),
        "inserted_tasks": task_count,
        "inserted_comments": comment_count,
        "inserted_activity": activity_count,
        "fallback_comment_author_count": fallback_comment_count,
        "created_task_ids": created_ids,
        "unmapped_people": unresolved,
    }


def report(todos: list[Todo]) -> dict:
    people = set()
    for todo in todos:
        people.update([todo.owner, todo.created_by])
        people.update(comment.author for comment in todo.comments)
        people.update(activity.actor for activity in todo.activity)
    return {
        "total_todos": len(todos),
        "open_todos": sum(todo.section == "Open" for todo in todos),
        "completed_todos": sum(todo.section == "Completed" for todo in todos),
        "in_progress_todos": sum(normalize_name(todo.status) == "in progress" for todo in todos),
        "not_started_todos": sum(normalize_name(todo.status) == "not started" for todo in todos),
        "todos_without_due_dates": sum(todo.due_date is None for todo in todos),
        "total_comments": sum(len(todo.comments) for todo in todos),
        "total_activity_entries": sum(len(todo.activity) for todo in todos),
        "source_people": sorted(person for person in people if person),
        "owners": dict(Counter(todo.owner for todo in todos)),
        "source_id_range": [min(int(todo.source_id) for todo in todos), max(int(todo.source_id) for todo in todos)],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="Path to Pulse Team Tyler export Markdown")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate without making database changes")
    parser.add_argument("--allow-unmapped", action="store_true", help="Assign unmatched comment authors to the project owner with attribution")
    parser.add_argument("--report", type=Path, help="Write JSON report to this file")
    args = parser.parse_args()

    todos = parse_export(args.export)
    summary = report(todos)
    if len(todos) != 258 or summary["open_todos"] != 59 or summary["completed_todos"] != 199:
        raise ValueError(f"Unexpected export totals: {summary}")

    connection = get_connection()
    try:
        user_map, unmapped = resolve_users(connection, summary["source_people"])
        summary["mapped_people"] = {name: user_map.get(normalize_name(name)) for name in summary["source_people"]}
        summary["unmapped_people"] = unmapped
        if args.dry_run:
            summary["mode"] = "dry_run"
        else:
            result = import_todos(connection, todos, user_map, args.allow_unmapped)
            connection.commit()
            summary.update(result)
            summary["mode"] = "imported"
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    output = json.dumps(summary, indent=2, default=str)
    print(output)
    if args.report:
        args.report.write_text(output + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
