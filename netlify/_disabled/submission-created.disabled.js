exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.payload || {};
    if (payload.form_name !== 'digest') return { statusCode: 204 };

    const data = payload.data || {};
    const token = process.env.PIPEDRIVE_API_TOKEN || "";
    const email = (data.email || "").trim();
    const name = (data.name || data.full_name || (email.split('@')[0] || "Digest Subscriber")).trim();

    if (!token || !email) { console.log("skip", { hasToken: !!token, email }); return { statusCode: 204 }; }

    const headers = { 'Content-Type': 'application/json' };
    const base = 'https://api.pipedrive.com/v1';
    const q = '?api_token=' + encodeURIComponent(token);

    let personId = null;

    try {
      const sr = await fetch(base + '/persons/search' + q + '&term=' + encodeURIComponent(email) + '&fields=email&exact_match=true');
      const sj = await sr.json();
      if (sj?.data?.items?.length) personId = sj.data.items[0].item.id;
    } catch (e) { console.log("search_err", e); }

    if (!personId) {
      try {
        const personBody = { name, email: [{ value: email, primary: true, label: "work" }] };
        const pr = await fetch(base + '/persons' + q, { method: 'POST', headers, body: JSON.stringify(personBody) });
        const pj = await pr.json();
        personId = pj?.data?.id || null;
        console.log("person_create", { status: pr.status, personId, pj_has_data: !!pj?.data });
      } catch (e) { console.log("person_err", e); }
    }

    if (personId) {
      try {
        const lr = await fetch(base + '/leads' + q, { method: 'POST', headers, body: JSON.stringify({ title: 'BlackGrid Digest: ' + email, person_id: personId }) });
        console.log("lead_create", { status: lr.status, personId });
      } catch (e) { console.log("lead_err", e); }
    } else {
      console.log("no_person", { email });
    }

    return { statusCode: 204 };
  } catch (e) {
    console.log("handler_err", e);
    return { statusCode: 204 };
  }
};
