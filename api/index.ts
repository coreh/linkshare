// Vercel requires serverless functions to live in api/ — no exceptions. (╯°□°)╯︵ ┻━┻
// So here we are, with a perfectly good src/index.ts one directory over,
// writing a shim file because Vercel's config validator won't let us
// point includeFiles at anything outside of api/.
export { default } from "../src/index";
