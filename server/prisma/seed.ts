/**
 * Idempotent demo seed: 1 administrator, 2 managers, 5 employees, and base departments.
 * Existing accounts are never modified. Every seeded account must change its password at first login.
 * Run: npm run db:seed (from the server directory)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = '123456';

const departments = ['مدیریت', 'مالی و اداری', 'منابع انسانی', 'فناوری اطلاعات'];

const people = [
  { username: 'admin', fullName: 'مدیر سامانه', role: 'ADMIN', employeeCode: 'A-001', dept: 'مدیریت', jobTitle: 'مدیر سامانه', manager: null },
  { username: 'manager1', fullName: 'مدیر نمونه مالی', role: 'MANAGER', employeeCode: 'M-001', dept: 'مالی و اداری', jobTitle: 'مدیر مالی و اداری', manager: null },
  { username: 'manager2', fullName: 'مدیر نمونه فناوری', role: 'MANAGER', employeeCode: 'M-002', dept: 'فناوری اطلاعات', jobTitle: 'مدیر فناوری اطلاعات', manager: null },
  { username: 'employee1', fullName: 'کارمند نمونه یک', role: 'EMPLOYEE', employeeCode: 'E-001', dept: 'مالی و اداری', jobTitle: 'کارشناس مالی', manager: 'manager1' },
  { username: 'employee2', fullName: 'کارمند نمونه دو', role: 'EMPLOYEE', employeeCode: 'E-002', dept: 'مالی و اداری', jobTitle: 'کارشناس اداری', manager: 'manager1' },
  { username: 'employee3', fullName: 'کارمند نمونه سه', role: 'EMPLOYEE', employeeCode: 'E-003', dept: 'فناوری اطلاعات', jobTitle: 'توسعه‌دهنده', manager: 'manager2' },
  { username: 'employee4', fullName: 'کارمند نمونه چهار', role: 'EMPLOYEE', employeeCode: 'E-004', dept: 'فناوری اطلاعات', jobTitle: 'پشتیبان سیستم', manager: 'manager2' },
  { username: 'employee5', fullName: 'کارمند نمونه پنج', role: 'EMPLOYEE', employeeCode: 'E-005', dept: 'مدیریت', jobTitle: 'دستیار مدیریت', manager: 'manager1' },
] as const;

async function main() {
  for (const name of departments) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  }
  await prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  for (const p of people) {
    const exists = await prisma.user.findUnique({ where: { username: p.username } });
    if (exists) continue;
    const dept = await prisma.department.findUniqueOrThrow({ where: { name: p.dept } });
    const manager = p.manager ? await prisma.user.findUniqueOrThrow({ where: { username: p.manager } }) : null;
    await prisma.user.create({
      data: {
        username: p.username,
        fullName: p.fullName,
        role: p.role,
        employeeCode: p.employeeCode,
        departmentId: dept.id,
        jobTitle: p.jobTitle,
        managerId: manager?.id ?? null,
        passwordHash,
        mustChangePassword: true,
      },
    });
    console.log(`created ${p.role.padEnd(8)} ${p.username}`);
  }
  console.log(`Done. Default password for seeded accounts: ${DEFAULT_PASSWORD} (must be changed at first login).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
