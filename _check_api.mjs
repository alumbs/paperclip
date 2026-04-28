// List Coolify projects, then delete the test project
async function main() {
  const COOLIFY = 'https://coolify.bizinabox.online';
  const TOKEN = '5|ssQaCUzMwD2W7AgCnr4Op4sdU5jXIJCe5ug9UpRse8875ebf';
  const PROJECT_UUID = 'f14ihokwdk0trt02uvb7myqx';
  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' };

  // --- Step 1: List projects ---
  console.log('=== Step 1: List Coolify projects ===');
  const listRes = await fetch(`${COOLIFY}/api/v1/projects`, { headers });
  console.log(`List status: ${listRes.status}`);
  const projects = await listRes.json();
  console.log(JSON.stringify(projects, null, 2));

  // --- Step 2: Delete the test project ---
  console.log(`\n=== Step 2: Delete project ${PROJECT_UUID} ===`);
  const delRes = await fetch(`${COOLIFY}/api/v1/projects/${PROJECT_UUID}`, {
    method: 'DELETE',
    headers,
  });
  console.log(`Delete status: ${delRes.status}`);
  try {
    const delData = await delRes.json();
    console.log(JSON.stringify(delData));
  } catch { console.log(await delRes.text()); }

  console.log('\n=== Done ===');
}
main();
