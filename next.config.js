/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // exceljs bevat optionele modules die niet in de client-bundle horen;
  // markeer als extern voor server components. (OCR draait nu client-side.)
  experimental: {
    serverComponentsExternalPackages: ["exceljs"],
  },
};

module.exports = nextConfig;
