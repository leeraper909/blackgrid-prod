exports.handler = async (event) => {
  try { console.log("CSP_REPORT", (event.body||"").slice(0,5000)); } catch(e){}
  return { statusCode: 204 };
};
