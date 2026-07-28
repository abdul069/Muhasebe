/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // tesseract.js en exceljs bevatten native/optionele modules die niet in de
  // client-bundle horen; markeer ze als extern voor server components.
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js", "exceljs"],
  },
};

module.exports = nextConfig;
