import { and, eq } from "drizzle-orm";
import { kbArticles, kbCategories } from "../drizzle/schema";
import { getDb } from "./db";
import {
  SAVVYOS_TRAINING_GUIDES,
  TRAINING_GUIDES_CATEGORY,
} from "./trainingGuides";

/**
 * Publishes the canonical SavvyOS role guides without creating duplicate
 * categories or articles on subsequent application starts.
 */
export async function ensureSavvyOSTrainingGuides(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[TrainingGuides] Database unavailable; publication skipped");
    return;
  }

  const [existingCategory] = await db
    .select({ id: kbCategories.id })
    .from(kbCategories)
    .where(eq(kbCategories.name, TRAINING_GUIDES_CATEGORY.name))
    .limit(1);

  let categoryId: number;
  if (existingCategory) {
    categoryId = existingCategory.id;
    await db
      .update(kbCategories)
      .set({
        type: TRAINING_GUIDES_CATEGORY.type,
        description: TRAINING_GUIDES_CATEGORY.description,
        visibleToRoles: TRAINING_GUIDES_CATEGORY.visibleToRoles,
        sortOrder: TRAINING_GUIDES_CATEGORY.sortOrder,
      })
      .where(eq(kbCategories.id, categoryId));
  } else {
    const [result] = await db.insert(kbCategories).values(TRAINING_GUIDES_CATEGORY);
    categoryId = Number((result as { insertId: number }).insertId);
  }

  for (const guide of SAVVYOS_TRAINING_GUIDES) {
    const [existingArticle] = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(
        and(
          eq(kbArticles.categoryId, categoryId),
          eq(kbArticles.title, guide.title)
        )
      )
      .limit(1);

    const guideValues = {
      content: guide.content,
      visibleToRoles: guide.visibleToRoles,
      status: "published" as const,
      sortOrder: guide.sortOrder,
    };

    if (existingArticle) {
      await db
        .update(kbArticles)
        .set(guideValues)
        .where(eq(kbArticles.id, existingArticle.id));
    } else {
      await db.insert(kbArticles).values({
        categoryId,
        title: guide.title,
        ...guideValues,
      });
    }
  }

  console.log(`[TrainingGuides] Published ${SAVVYOS_TRAINING_GUIDES.length} role guides`);
}
