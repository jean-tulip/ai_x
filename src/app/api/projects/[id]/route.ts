export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// DELETE: Delete a project and nullify its references in reports
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;

        // Check if project exists
        const project = await prisma.project.findUnique({
            where: { id: projectId }
        });

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // First, nullify projectId for all reports associated with this project
        // This preserves historical data while removing the project reference
        await prisma.report.updateMany({
            where: { projectId: projectId },
            data: { projectId: null }
        });

        // Now delete the project
        await prisma.project.delete({
            where: { id: projectId }
        });

        return NextResponse.json({ success: true, message: "Project deleted successfully" });
    } catch (e: any) {
        console.error("Error deleting project:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: Get a single project with full context
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;

        const project = await prisma.project.findUnique({
            where: { id: projectId }
        });

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        return NextResponse.json(project);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// PATCH: Update a project
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const { name, description, contextText } = await req.json();

        // Check if project exists
        const existing = await prisma.project.findUnique({
            where: { id: projectId }
        });

        if (!existing) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Update project
        const updated = await prisma.project.update({
            where: { id: projectId },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(contextText !== undefined && { contextText }),
            }
        });

        return NextResponse.json(updated);
    } catch (e: any) {
        console.error("Error updating project:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
