function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function sendRegistrationCode(params: {
  apiKey: string;
  from: string;
  to: string;
  code: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: "TKA 康复平台注册验证码",
      text: `你的注册验证码是 ${params.code}，10 分钟内有效。请勿将验证码告诉他人。`,
      html: `<div style="font-family:system-ui,sans-serif;color:#17251f"><h2>TKA 康复平台</h2><p>你的注册验证码：</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${escapeHtml(params.code)}</p><p>验证码 10 分钟内有效，请勿转发。</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider rejected the request (${response.status}): ${detail.slice(0, 200)}`);
  }
}
