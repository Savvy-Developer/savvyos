# SavvyOS Job Board: "Indeed-Like" Enhancement Plan

## Executive Summary

The current SavvyOS Job Board provides a solid foundation with basic applicant tracking, a multi-step public application flow, and AI-driven candidate insights. However, to transform it into a comprehensive, "Indeed-like" experience, we need to significantly expand the feature set. This requires shifting from a simple application portal to a dynamic, two-sided marketplace that serves both job seekers and employers proactively. 

This document outlines a comprehensive plan to bridge the gap between the current SavvyOS Job Board and a full-featured hiring platform, categorized into Candidate Experience, Employer Experience, and Infrastructure.

---

## 1. Candidate Experience Enhancements

Currently, candidates can view active jobs and submit a multi-step application with a resume upload. To achieve an Indeed-like experience, we need to empower candidates to proactively manage their job search and maintain a persistent presence on the platform.

We propose introducing persistent Candidate Profiles. Instead of resumes existing merely as static files attached to a specific application, candidates will be able to create an account and build a structured profile. By parsing uploaded resumes to extract work history, education, and skills, candidates can make their profiles searchable by Savvy recruiters. This shifts the platform from a reactive application drop-box to a proactive talent pool.

Furthermore, the job discovery process needs improvement. The current simple list of active jobs should be upgraded with advanced search capabilities, including keyword matching, location radius filtering, and department categorization. Alongside this, we will introduce Job Alerts, allowing candidates to save their search criteria and receive automated email notifications when new, relevant jobs are posted. This feature is critical for keeping candidates engaged and driving return traffic to the careers page.

Finally, a dedicated Candidate Dashboard will replace the current magic-link draft system. This dashboard will allow users to view their application statuses in real-time, withdraw applications if necessary, and communicate directly with recruiters, providing a modern, transparent application experience.

| Feature | Current State | Proposed "Indeed-Like" State | Value Added |
| :--- | :--- | :--- | :--- |
| **Profiles** | Static S3 files per application | Persistent, searchable structured profiles | Enables proactive candidate sourcing. |
| **Discovery** | Static list of active jobs | Advanced search, filtering, and Job Alerts | Drives engagement and return traffic. |
| **Management** | Magic link for drafts | Full dashboard for status tracking and messaging | Improves transparency and candidate experience. |

---

## 2. Employer & Recruiter (Admin) Enhancements

The current admin dashboard allows for basic job creation, custom questions, and application review with AI insights. To match Indeed's capabilities, we must introduce robust Applicant Tracking System (ATS) features that streamline the entire hiring pipeline.

The applicant tracking pipeline requires significant upgrades. We will introduce customizable pipelines, allowing admins to define specific hiring stages tailored to different departments or roles. To handle high volumes of applicants efficiently, we will add bulk action capabilities, enabling recruiters to reject, advance, or email multiple candidates simultaneously. Additionally, collaborative hiring features will be implemented, allowing multiple team members to leave private scorecards and structured feedback, replacing the current single "adminNotes" text field.

Automation will be a key focus for improving recruiter efficiency. While custom questions currently exist, they do not automatically filter candidates. We will introduce Knockout Questions, which will automatically reject or flag candidates who provide disqualifying answers (e.g., regarding visa sponsorship or required licenses). Furthermore, integrating automated interview scheduling linked to recruiters' calendars will eliminate the back-and-forth emails typically required to coordinate screening calls.

Finally, we will build a proactive sourcing interface. Admins will be able to query the new Candidate Profile database using keywords, skills, and locations, allowing them to invite promising candidates to apply for open roles directly. This will be supported by a new Analytics Dashboard providing insights into time-to-hire, application drop-off rates, and pipeline conversion metrics.

| Feature | Current State | Proposed "Indeed-Like" State | Value Added |
| :--- | :--- | :--- | :--- |
| **Pipeline** | Fixed status dropdowns | Customizable stages, bulk actions, scorecards | Streamlines high-volume hiring and collaboration. |
| **Screening** | Manual review of custom questions | Automated knockout questions and auto-scheduling | Drastically reduces manual administrative work. |
| **Sourcing** | Reactive (waiting for applicants) | Searchable resume database for proactive outreach | Access to a wider talent pool for hard-to-fill roles. |
| **Analytics** | None | Dashboards for time-to-hire and drop-off rates | Data-driven insights to optimize the hiring process. |

---

## 3. Platform & Infrastructure Additions

To support these new features, several underlying backend and infrastructure changes will be required. 

First, we must implement a robust search infrastructure. Whether utilizing advanced MySQL full-text search, Elasticsearch, or Algolia, a powerful search engine is necessary to drive both the candidate job search and the recruiter resume database queries. 

Second, we will integrate a resume parsing API (such as Affinda or a custom LLM-based extraction tool). This will automatically extract text from uploaded PDFs to populate the structured Candidate Profiles and application fields, reducing friction for the applicant and standardizing data for the recruiter.

Lastly, the current Resend email integration will be expanded to support a two-way messaging system. This will keep all communication between candidates and recruiters centralized within the SavvyOS platform, ensuring a complete historical record of candidate interactions.

---

## Implementation Phasing Strategy

To deliver value quickly while managing technical complexity, I recommend implementing this plan in three distinct phases.

**Phase 1: Candidate Engagement & Foundation**
The focus will be on upgrading the public-facing features. We will build the advanced Job Search, Filtering, and Job Alerts. Simultaneously, we will implement the foundational Candidate Profiles and the Resume Parsing infrastructure to begin capturing structured data.

**Phase 2: Recruiter Efficiency & Automation**
With candidate data flowing in, we will upgrade the admin experience. This phase includes implementing Automated Screening (knockout questions), the customizable ATS pipeline features, and the automated Interview Scheduling integrations.

**Phase 3: Advanced ATS & Proactive Sourcing**
The final phase will transform the platform into a true marketplace. We will launch the searchable Resume Database for recruiters, deploy the Analytics Dashboard, and finalize the two-way centralized messaging system.

Please review this comprehensive plan. Once approved, or adjusted based on your priorities, we can begin technical scoping for Phase 1.
