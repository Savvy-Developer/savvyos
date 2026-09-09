import { eq, like, or } from "drizzle-orm";
import { properties, transactionPayoutItems } from "../drizzle/schema";

export function buildPayoutSearchCondition(search: string) {
  const payoutSearch = search.replace(/\s+/g, " ").trim();
  const memoNumberMatch = payoutSearch.includes(".")
    ? eq(transactionPayoutItems.expMemoNumber, payoutSearch)
    : or(
        eq(transactionPayoutItems.expMemoNumber, payoutSearch),
        like(transactionPayoutItems.expMemoNumber, `${payoutSearch}.%`),
      );

  return or(
    memoNumberMatch,
    like(properties.address, `%${payoutSearch}%`),
    like(properties.city, `%${payoutSearch}%`),
    like(properties.state, `%${payoutSearch}%`),
    like(properties.zip, `%${payoutSearch}%`),
  );
}
