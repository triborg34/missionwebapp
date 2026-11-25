import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { config } from '../config.js';
import { formatJalaliDate, formatJalaliDateTime, faDigits } from '../lib/jalali.js';
import { dataUri, readStoredFile } from '../lib/storage.js';
import { sha256 } from '../lib/security.js';
import type { ImageMime } from '../lib/storage.js';
import { detectImage } from '../lib/storage.js';

export interface ApprovalSnapshot {
  missionNumber: string;
  orgName: string;
  employee: { fullName: string; employeeCode: string; departmentName: string; jobTitle: string };
  mission: {
    destination: string;
    purpose: string;
    missionDate: string;
    departureTime: string;
    returnDate: string;
    returnTime: string;
    description: string;
    submittedAt: string;
  };
  decision: { action: 'APPROVED' | 'REJECTED'; managerName: string; managerPosition: string; decidedAt: string };
}

export interface PdfInput {
  snapshot: ApprovalSnapshot;
  signaturePath?: string | null;
  stampPath?: string | null;
  logoPath?: string | null;
}

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fa = (value: string) => esc(faDigits(value));

const CANDIDATE_BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

function findBrowser(): string {
  if (config.chromePath) return config.chromePath;
  const found = CANDIDATE_BROWSERS.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('مرورگر Chrome یا Chromium یافت نشد. مسیر آن را در CHROME_PATH تنظیم کنید.');
  }
  return found;
}

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: findBrowser(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--font-render-hinting=none'],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

let fontCss: string | null = null;
function fontFaces(): string {
  if (fontCss) return fontCss;
  const dir = path.resolve(process.cwd(), 'node_modules/vazirmatn/fonts/ttf');
  const load = (file: string) => dataUri('font/ttf', fs.readFileSync(path.join(dir, file)));
  fontCss = `
    @font-face { font-family: 'VazirPDF'; font-weight: 400; src: url(${load('Vazirmatn-Regular.ttf')}) format('truetype'); }
    @font-face { font-family: 'VazirPDF'; font-weight: 700; src: url(${load('Vazirmatn-Bold.ttf')}) format('truetype'); }`;
  return fontCss;
}

async function imageDataUri(relative?: string | null): Promise<string | null> {
  if (!relative) return null;
  const buf = await readStoredFile(relative);
  const detected = detectImage(buf);
  if (!detected) return null;
  return dataUri(detected.mime satisfies ImageMime, buf);
}

function buildHtml(input: PdfInput & { signatureSrc: string | null; stampSrc: string | null; logoSrc: string | null }): string {
  const s = input.snapshot;
  const verification = sha256(JSON.stringify(s)).slice(0, 16).toUpperCase();
  const logo = input.logoSrc ? `<img class="logo" src="${input.logoSrc}" alt="">` : '';
  const sig = input.signatureSrc ? `<img src="${input.signatureSrc}" alt="">` : '';
  const stamp = input.stampSrc ? `<img src="${input.stampSrc}" alt="">` : '';
  const row = (label: string, value: string) =>
    `<tr><th>${esc(label)}</th><td>${fa(value || '—')}</td></tr>`;

  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
${fontFaces()}
* { box-sizing: border-box; }
:root { color-scheme: light; }
html, body { background: #fff; }
body { font-family: 'VazirPDF', sans-serif; font-size: 11pt; color: #111; margin: 0; direction: rtl; }
.doc { border: 1.5px solid #1e3a5f; padding: 6mm; }
.head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a5f; padding-bottom: 4mm; }
.head .org { text-align: center; flex: 1; }
.head .org h1 { font-size: 14pt; margin: 0 0 2mm; color: #1e3a5f; }
.head .org h2 { font-size: 12pt; margin: 0; font-weight: 700; }
.logo { height: 20mm; width: 20mm; object-fit: contain; }
.logo-spacer { width: 20mm; }
.meta { width: 48mm; font-size: 9.5pt; }
.meta div { margin-bottom: 1.5mm; }
.section { margin-top: 5mm; }
.section h3 { background: #1e3a5f; color: #fff; font-size: 10.5pt; margin: 0; padding: 1.5mm 3mm; }
table { width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #9aa7b8; padding: 2.2mm 3mm; vertical-align: middle; }
th { background: #eef2f7; width: 26%; text-align: right; font-weight: 700; font-size: 10pt; }
td { font-size: 10.5pt; }
.approval td.box { height: 34mm; width: 50%; text-align: center; padding: 2mm; }
.approval td.box .lbl { font-size: 9pt; color: #555; display: block; margin-bottom: 1.5mm; }
.approval td.box img { max-width: 100%; max-height: 27mm; object-fit: contain; }
.foot { margin-top: 5mm; font-size: 8.5pt; color: #444; display: flex; justify-content: space-between; border-top: 1px dashed #9aa7b8; padding-top: 2.5mm; }
.status { display: inline-block; background: #1f9d55; color: #fff; padding: 0.6mm 3mm; border-radius: 2mm; font-weight: 700; font-size: 10pt; }
</style></head><body>
<div class="doc">
  <div class="head">
    ${logo || '<div class="logo-spacer"></div>'}
    <div class="org">
      <h1>${fa(s.orgName)}</h1>
      <h2>برگه مأموریت اداری</h2>
    </div>
    <div class="meta">
      <div><b>شماره مأموریت:</b><br>${fa(s.missionNumber)}</div>
      <div><b>تاریخ صدور:</b> ${fa(formatJalaliDateTime(new Date(s.decision.decidedAt)))}</div>
      <div><span class="status">تأیید شده</span></div>
    </div>
  </div>

  <div class="section">
    <h3>مشخصات کارمند</h3>
    <table>
      <tr>${row('نام و نام خانوادگی', s.employee.fullName)}${row('کد پرسنلی', s.employee.employeeCode)}</tr>
      <tr>${row('واحد سازمانی', s.employee.departmentName)}${row('سمت', s.employee.jobTitle)}</tr>
    </table>
  </div>

  <div class="section">
    <h3>مشخصات مأموریت</h3>
    <table>
      <tr>${row('مقصد', s.mission.destination)}${row('تاریخ حرکت', formatJalaliDate(s.mission.missionDate))}</tr>
      <tr>${row('ساعت حرکت', s.mission.departureTime)}${row('تاریخ بازگشت', formatJalaliDate(s.mission.returnDate))}</tr>
      <tr>${row('ساعت بازگشت', s.mission.returnTime)}${row('تاریخ ثبت درخواست', formatJalaliDate(s.mission.submittedAt.slice(0, 10)))}</tr>
      <tr><th>شرح و هدف مأموریت</th><td colspan="3" style="white-space:pre-wrap">${fa(s.mission.purpose)}</td></tr>
      ${s.mission.description ? `<tr><th>توضیحات تکمیلی</th><td colspan="3" style="white-space:pre-wrap">${fa(s.mission.description)}</td></tr>` : ''}
    </table>
  </div>

  <div class="section">
    <h3>تأیید مدیر</h3>
    <table class="approval">
      <tr>
        <td class="box"><span class="lbl">امضا</span>${sig}</td>
        <td class="box"><span class="lbl">مهر سازمان</span>${stamp}</td>
      </tr>
      <tr>${row('نام مدیر تأییدکننده', s.decision.managerName)}${row('سمت', s.decision.managerPosition)}</tr>
      <tr>${row('تاریخ تأیید', formatJalaliDateTime(new Date(s.decision.decidedAt)))}<th>کد کنترل سند</th><td>${fa(verification)}</td></tr>
    </table>
  </div>

  <div class="foot">
    <span>این برگه به‌صورت الکترونیکی از سامانه مدیریت مأموریت صادر شده است.</span>
    <span>${fa(s.missionNumber)}</span>
  </div>
</div>
</body></html>`;
}

/** Renders the official approved-mission PDF from the frozen approval snapshot and frozen assets. */
export async function renderApprovalPdf(input: PdfInput): Promise<Buffer> {
  const html = buildHtml({
    ...input,
    signatureSrc: await imageDataUri(input.signaturePath),
    stampSrc: await imageDataUri(input.stampPath),
    logoSrc: await imageDataUri(input.logoPath),
  });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
