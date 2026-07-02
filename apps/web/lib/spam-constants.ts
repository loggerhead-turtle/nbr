/**
 * Client-safe spam constants (no server-only imports), so both the signup form
 * (client) and the server action can reference the same honeypot field name.
 */

/** Hidden form field name. Bots fill every field; a non-empty value = a bot. */
export const HONEYPOT_FIELD = "company_website";
