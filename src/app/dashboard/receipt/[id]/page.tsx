import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import ReceiptDetail from "./ReceiptDetail";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const receipt = await prisma.receipt.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, companyName: true, email: true } },
      vatLines: { orderBy: { rate: "asc" } },
    },
  });

  if (!receipt) notFound();
  if (session.role !== "ACCOUNTANT" && receipt.userId !== session.userId) {
    redirect("/dashboard");
  }

  return (
    <ReceiptDetail
      isAccountant={session.role === "ACCOUNTANT"}
      receipt={{
        id: receipt.id,
        merchant: receipt.merchant,
        receiptDate: receipt.receiptDate
          ? receipt.receiptDate.toISOString().slice(0, 10)
          : "",
        totalAmount: receipt.totalAmount,
        taxAmount: receipt.taxAmount,
        currency: receipt.currency || "TRY",
        note: receipt.note,
        status: receipt.status,
        docType: receipt.docType,
        ocrText: receipt.ocrText || "",
        createdAt: receipt.createdAt.toISOString(),
        clientName: receipt.user.companyName || receipt.user.name,
        clientEmail: receipt.user.email,
        vatLines: receipt.vatLines.map((v) => ({
          rate: v.rate,
          base: v.base,
          amount: v.amount,
        })),
      }}
    />
  );
}
