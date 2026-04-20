import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    return NextResponse.json({ ok: rows[0].ok === 1 });
  } catch (error) {
    console.error("DB ERROR:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code ?? null,
      },
      { status: 500 }
    );
  }
}