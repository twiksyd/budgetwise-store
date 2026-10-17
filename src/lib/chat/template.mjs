// Quick-reply variables. Only these names are substituted, as plain text;
// anything else in {{ }} is left exactly as written. No expressions, no
// code, no HTML — the result is inserted into a textarea as text.
export const TEMPLATE_VARIABLES = Object.freeze([
  "customer_name",
  "order_number",
  "roblox_username",
  "total",
]);

const TOKEN_RE = /\{\{\s*([a-z_]{1,40})\s*\}\}/g;

export function renderTemplate(body, values) {
  if (typeof body !== "string") return "";
  return body.replace(TOKEN_RE, (token, name) => {
    if (!TEMPLATE_VARIABLES.includes(name)) return token;
    const value = values?.[name];
    return value === undefined || value === null || value === "" ? token : String(value);
  });
}
