// Draait `prisma db push` alleen als er een DATABASE_URL beschikbaar is.
// Zo blokkeert een ontbrekende/onbereikbare database de Vercel-build niet
// (bijv. bij de allereerste deploy vóórdat de Postgres-koppeling is gezet).
const { execSync } = require("child_process");

if (!process.env.DATABASE_URL) {
  console.log("[db-push] DATABASE_URL ontbreekt — db push overgeslagen.");
  process.exit(0);
}

try {
  execSync("prisma db push --skip-generate", { stdio: "inherit" });
} catch (e) {
  console.error(
    "[db-push] db push mislukte; build gaat door. Draai later opnieuw.",
    e && e.message
  );
  process.exit(0); // build niet blokkeren
}
