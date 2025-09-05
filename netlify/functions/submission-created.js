exports.handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body || "{}");
    if (!payload || payload.form_name !== "digest") return { statusCode: 204 };

    const d = payload.data || {};
    const email = d.email || "(no email)";
    const utms = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']
      .reduce((o,k)=> (d[k] ? (o[k]=d[k],o) : o), {});
    const meta = { referrer: d.referrer || "", page: d.page || "" };

    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🆕 New BlackGrid digest signup: ${email}`,
          attachments: [
            { color: "#00d1b2", fields: [
              ...Object.entries(utms).map(([k,v])=>({ title:k, value:String(v), short:true })),
              ...Object.entries(meta).map(([k,v])=>({ title:k, value:String(v||'—'), short:true })),
            ]}
          ]
        }),
      });
    }
    return { statusCode: 204 };
  } catch (_) {
    return { statusCode: 204 };
  }
};
