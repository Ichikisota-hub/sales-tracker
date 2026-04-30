import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function sendInviteEmail({
  to,
  orgName,
  inviteUrl,
}: {
  to: string
  orgName: string
  inviteUrl: string
}): Promise<{ sent: boolean; error?: string }> {
  if (!resend) {
    return { sent: false, error: 'RESEND_API_KEY が設定されていません' }
  }

  const from = process.env.RESEND_FROM_EMAIL || 'noreply@example.com'

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8,#7c3aed);padding:32px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">数値報告管理アプリ</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:6px;">Sales Tracker</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#0f172a;line-height:1.3;">
                ${orgName} に招待されました
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
                以下のボタンをタップしてアカウントを作成してください。<br>
                招待リンクは <strong>7日間</strong> 有効です。
              </p>
              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="${inviteUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;padding:16px 40px;border-radius:12px;letter-spacing:0.3px;">
                  招待を受諾してアカウント作成
                </a>
              </div>
              <!-- URL fallback -->
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-top:8px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">
                  ボタンが押せない場合はこちらのURLを開いてください
                </p>
                <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all;line-height:1.5;">${inviteUrl}</p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
                このメールに心当たりがない場合は無視してください。<br>
                リンクをクリックしない限り、アカウントは作成されません。
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `【数値報告管理アプリ】${orgName} への招待`,
      html,
    })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '不明なエラー'
    return { sent: false, error: msg }
  }
}
