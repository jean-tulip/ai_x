import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const svgPath = path.join(process.cwd(), "presentation", "architecture.svg");

  try {
    const svgContent = fs.readFileSync(svgPath, "utf-8");
    return new NextResponse(svgContent, {
      headers: {
        "Content-Type": "image/svg+xml",
      },
    });
  } catch {
    return new NextResponse("SVG not found", { status: 404 });
  }
}
