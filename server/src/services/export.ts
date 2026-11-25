import ExcelJS from 'exceljs';
import type { AuthUser } from '../middleware/auth.js';
import { prisma } from '../db.js';
import { formatJalaliDate, formatJalaliDateTime } from '../lib/jalali.js';
import { parse } from '../lib/validation.js';
import { missionFilterSchema, missionInclude, missionWhere } from './missions.js';

const STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار تأیید',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
  CANCELLED: 'لغو شده',
};

const MAX_EXPORT_ROWS = 5000;

/** Excel export of the missions visible to the caller, using the same filters as the list. */
export async function missionsWorkbook(user: AuthUser, query: unknown): Promise<Buffer> {
  const f = parse(missionFilterSchema, query);
  const rows = await prisma.mission.findMany({
    where: missionWhere(user, f),
    include: missionInclude,
    orderBy: [{ [f.sortBy]: f.sortDir }, { id: 'desc' }],
    take: MAX_EXPORT_ROWS,
  });

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet('مأموریت‌ها', { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: 'شماره مأموریت', key: 'no', width: 20 },
    { header: 'نام کارمند', key: 'name', width: 24 },
    { header: 'کد پرسنلی', key: 'code', width: 14 },
    { header: 'واحد سازمانی', key: 'dept', width: 20 },
    { header: 'مقصد', key: 'dest', width: 24 },
    { header: 'تاریخ حرکت', key: 'mdate', width: 14 },
    { header: 'ساعت حرکت', key: 'dtime', width: 12 },
    { header: 'تاریخ بازگشت', key: 'rdate', width: 14 },
    { header: 'ساعت بازگشت', key: 'rtime', width: 12 },
    { header: 'وضعیت', key: 'status', width: 16 },
    { header: 'تاریخ ثبت', key: 'created', width: 18 },
    { header: 'تاریخ تصمیم', key: 'decided', width: 18 },
    { header: 'مدیر تصمیم‌گیرنده', key: 'approver', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const m of rows) {
    ws.addRow({
      no: m.missionNumber,
      name: m.employee.fullName,
      code: m.employeeCode,
      dept: m.departmentName ?? '',
      dest: m.destination,
      mdate: formatJalaliDate(m.missionDate),
      dtime: m.departureTime,
      rdate: formatJalaliDate(m.returnDate),
      rtime: m.returnTime,
      status: STATUS_FA[m.status] ?? m.status,
      created: formatJalaliDateTime(m.createdAt),
      decided: m.decidedAt ? formatJalaliDateTime(m.decidedAt) : '',
      approver: m.decidedBy?.fullName ?? '',
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
