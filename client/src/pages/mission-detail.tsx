import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Download, Pencil, XCircle, Ban } from 'lucide-react';
import { api, apiUrl, ApiError } from '../lib/api';
import { ACTION_LABEL, formatDate, formatDateTime, formatTime } from '../lib/format';
import type { Mission } from '../lib/types';
import { Button, Card, ConfirmDialog, EmptyState, Modal, PageHeader, Spinner, StatusBadge, TextArea, useToast } from '../components/ui';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 font-medium text-gray-900">{children || '—'}</dd>
    </div>
  );
}

type Pending = null | 'approve' | 'cancel' | 'reject';

export function MissionDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [mission, setMission] = useState<Mission | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api<Mission>(`/missions/${id}`)
      .then(setMission)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (path: string, body?: unknown, success?: string) => {
    setBusy(true);
    try {
      const updated = await api<Mission>(path, { method: 'POST', json: body ?? {} });
      setMission(updated);
      if (success) toast.success(success);
      setPending(null);
      setReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'عملیات با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    if (reason.trim().length < 5) {
      setReasonError('دلیل رد باید حداقل ۵ نویسه باشد');
      return;
    }
    await run(`/missions/${id}/reject`, { reason: reason.trim() }, 'درخواست مأموریت رد شد');
  };

  if (loading) return <Spinner />;
  if (error || !mission) {
    return (
      <Card>
        <EmptyState title={error || 'مأموریت یافت نشد'} action={<Link to="/" className="text-brand-700 hover:underline">بازگشت به داشبورد</Link>} />
      </Card>
    );
  }

  const p = mission.permissions;
  const decisionHistory = mission.history ?? [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`مأموریت ${mission.missionNumber}`}
        description={`ثبت شده در ${formatDateTime(mission.createdAt)}`}
        actions={
          <>
            {p.canEdit && (
              <Link to={`/missions/${mission.id}/edit`}>
                <Button variant="secondary">
                  <Pencil className="h-4 w-4" />
                  ویرایش
                </Button>
              </Link>
            )}
            {p.canCancel && (
              <Button variant="secondary" onClick={() => setPending('cancel')}>
                <Ban className="h-4 w-4" />
                لغو درخواست
              </Button>
            )}
            {p.canDecide && (
              <>
                <Button variant="success" onClick={() => setPending('approve')}>
                  <CheckCircle2 className="h-4 w-4" />
                  تأیید
                </Button>
                <Button variant="danger" onClick={() => setPending('reject')}>
                  <XCircle className="h-4 w-4" />
                  رد
                </Button>
              </>
            )}
            {p.canDownloadPdf && (
              <a href={apiUrl(`/missions/${mission.id}/pdf`)} download={`${mission.missionNumber}.pdf`}>
                <Button>
                  <Download className="h-4 w-4" />
                  دریافت برگه مأموریت (PDF)
                </Button>
              </a>
            )}
          </>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <StatusBadge status={mission.status} />
        {mission.status === 'REJECTED' && mission.rejectionReason && <span className="text-sm text-red-700">دلیل رد: {mission.rejectionReason}</span>}
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-gray-900">مشخصات مأموریت</h2>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="شماره مأموریت">{mission.missionNumber}</Info>
          <Info label="نام کارمند">{mission.employee.fullName}</Info>
          <Info label="کد پرسنلی">{mission.employee.employeeCode}</Info>
          <Info label="سمت">{mission.employee.jobTitle}</Info>
          <Info label="واحد سازمانی">{mission.department}</Info>
          <Info label="مقصد">{mission.destination}</Info>
          <Info label="تاریخ مأموریت">{formatDate(mission.missionDate)}</Info>
          <Info label="ساعت حرکت">{formatTime(mission.departureTime)}</Info>
          <Info label="تاریخ بازگشت">{formatDate(mission.returnDate)}</Info>
          <Info label="ساعت بازگشت">{formatTime(mission.returnTime)}</Info>
          <div className="sm:col-span-2 lg:col-span-3">
            <Info label="شرح و هدف مأموریت">
              <span className="whitespace-pre-line font-normal">{mission.purpose}</span>
            </Info>
          </div>
          {mission.description && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Info label="توضیحات تکمیلی">
                <span className="whitespace-pre-line font-normal">{mission.description}</span>
              </Info>
            </div>
          )}
        </dl>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-gray-900">تاریخچه تصمیم‌گیری</h2>
        {decisionHistory.length === 0 ? (
          <p className="text-sm text-gray-500">هنوز تصمیمی برای این درخواست ثبت نشده است.</p>
        ) : (
          <ul className="space-y-3">
            {decisionHistory.map((h) => (
              <li key={h.id} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {ACTION_LABEL[h.action] ?? h.action} — {h.manager.fullName}
                    {h.manager.jobTitle && <span className="text-gray-500"> ({h.manager.jobTitle})</span>}
                  </span>
                  <span className="text-gray-500">{formatDateTime(h.createdAt)}</span>
                </div>
                {h.reason && <p className="mt-2 text-gray-700">دلیل: {h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={pending === 'approve'}
        title="تأیید درخواست مأموریت"
        message={`با تأیید این درخواست، برگه رسمی مأموریت با امضا و مهر شما صادر می‌شود و دیگر قابل تغییر نیست.`}
        confirmLabel="تأیید و صدور برگه"
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => run(`/missions/${id}/approve`, {}, 'درخواست مأموریت تأیید شد')}
      />
      <ConfirmDialog
        open={pending === 'cancel'}
        title="لغو درخواست مأموریت"
        message="آیا از لغو این درخواست اطمینان دارید؟"
        confirmLabel="لغو درخواست"
        danger
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => run(`/missions/${id}/cancel`, {}, 'درخواست مأموریت لغو شد')}
      />
      <Modal
        open={pending === 'reject'}
        title="رد درخواست مأموریت"
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              انصراف
            </Button>
            <Button variant="danger" onClick={confirmReject} loading={busy}>
              ثبت رد درخواست
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">دلیل رد درخواست<span className="mr-1 text-red-600">*</span></span>
          <TextArea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError('');
            }}
            error={reasonError}
            rows={4}
            placeholder="دلیل رد را برای کارمند توضیح دهید"
          />
          {reasonError && <span className="mt-1 block text-xs text-red-600">{reasonError}</span>}
        </label>
      </Modal>
    </div>
  );
}
