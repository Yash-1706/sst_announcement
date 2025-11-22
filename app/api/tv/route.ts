import { NextRequest, NextResponse } from 'next/server'; 
import { applyRateLimit, generalLimiterOptions } from '@/lib/middleware/rateLimit';
import { getTvData } from '@/lib/data/announcements';

export async function GET(request: NextRequest) {
    try{
        await applyRateLimit(request, generalLimiterOptions);
        const data = await getTvData();
        return NextResponse.json( { success: true, data }, { status: 200 } );
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Internal server error',
            },
            { status: error.status || 500 }
        );
    }
}