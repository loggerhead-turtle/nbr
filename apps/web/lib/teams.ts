// Team de-duplication helpers live in @nbr/db so both the web app and the worker
// (during scrape enrichment) share one implementation.
export { findPromotableTeam, mergeTeams } from "@nbr/db";
