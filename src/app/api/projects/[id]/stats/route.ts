export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;

        // Get all reports for this project
        const reports = await prisma.report.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                createdAt: true,
                score: true,
                issuesJson: true,
                documentType: true,
            }
        });

        // Calculate statistics
        const totalDocuments = reports.length;
        const scoresArray = reports.map(r => r.score).filter(s => s !== null) as number[];
        const averageScore = scoresArray.length > 0
            ? Math.round(scoresArray.reduce((a, b) => a + b, 0) / scoresArray.length)
            : null;

        // Count critical issues
        let criticalIssuesCount = 0;
        reports.forEach(report => {
            try {
                const issues = JSON.parse(report.issuesJson);
                criticalIssuesCount += issues.filter((i: any) => i.severity === "error").length;
            } catch (e) {
                // Skip if JSON parsing fails
            }
        });

        // Last activity
        const lastActivity = reports[0]?.createdAt ?? null;

        // Group by document type
        const byDocType: Record<string, number> = {};
        reports.forEach(r => {
            const type = r.documentType ?? "OTHER";
            byDocType[type] = (byDocType[type] || 0) + 1;
        });

        // Recent trend (last 7 days vs previous 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const recentCount = reports.filter(r => new Date(r.createdAt) >= sevenDaysAgo).length;
        const previousCount = reports.filter(r =>
            new Date(r.createdAt) >= fourteenDaysAgo &&
            new Date(r.createdAt) < sevenDaysAgo
        ).length;

        const trend = previousCount > 0
            ? ((recentCount - previousCount) / previousCount * 100).toFixed(1)
            : null;

        return NextResponse.json({
            totalDocuments,
            averageScore,
            criticalIssuesCount,
            lastActivity,
            documentTypeBreakdown: byDocType,
            recentTrend: trend,
            recentScores: scoresArray.slice(0, 10).reverse(), // Last 10 scores for chart
        });
    } catch (e: any) {
        console.error("Error fetching stats:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
