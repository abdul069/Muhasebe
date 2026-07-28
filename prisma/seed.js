// Seed-script: maakt een boekhouder (ACCOUNTANT) en een demo-klant (CLIENT) aan.
// Draaien met:  npm run db:seed
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function upsertUser({ email, password, name, companyName, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, companyName, role },
    create: { email, passwordHash, name, companyName, role },
  });
  return user;
}

async function main() {
  await upsertUser({
    email: "muhasebe@ornek.com",
    password: "muhasebe123",
    name: "Muhasebeci",
    companyName: null,
    role: "ACCOUNTANT",
  });

  await upsertUser({
    email: "musteri@ornek.com",
    password: "musteri123",
    name: "Örnek Müşteri",
    companyName: "Örnek Ltd. Şti.",
    role: "CLIENT",
  });

  console.log("✓ Seed tamamlandı.");
  console.log("  Muhasebeci  -> muhasebe@ornek.com / muhasebe123");
  console.log("  Müşteri     -> musteri@ornek.com / musteri123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
