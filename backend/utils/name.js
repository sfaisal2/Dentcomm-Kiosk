// The real DentTracks Patient schema stores firstName/lastName separately;
// our record still keeps one `name` field (splitting that out repo-wide is
// a bigger refactor), so integration-boundary services split it here.
function splitName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

module.exports = { splitName };
