const dataUrl = (file) => new URL(`../../public/data/${file}`, import.meta.url);

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url.pathname || url}`);
  return response.json();
}

async function loadEntry(entry, ctx) {
  let extension = null;
  if (entry.meta) {
    const meta = await loadJson(dataUrl(entry.meta));
    extension = meta.extension || null;
  }
  const moduleUrl = new URL(entry.module, import.meta.url);
  const loaded = await import(moduleUrl.href);
  if (typeof loaded.register !== 'function') {
    throw new Error(`${entry.id} does not export register(ctx).`);
  }
  await loaded.register({ ...ctx, extension, district: entry });
  return { id: entry.id, role: entry.role };
}

export async function loadCityModules(ctx) {
  const index = await loadJson(dataUrl('modules.json'));
  const loaded = [];
  for (const entry of index.systems ?? []) {
    loaded.push(await loadEntry({ ...entry, role: entry.role }, ctx));
  }
  for (const entry of index.districts ?? []) {
    loaded.push(await loadEntry({ ...entry, role: 'district' }, ctx));
  }
  return loaded;
}

export async function loadLandmarkModels() {
  const index = await loadJson(dataUrl('modules.json'));
  const models = [];
  for (const district of index.districts ?? []) {
    if (!district.landmarks) continue;
    const manifest = await loadJson(dataUrl(district.landmarks));
    for (const model of manifest.models ?? []) {
      models.push({ ...model, district: district.id, districtCode: district.code });
    }
  }
  return models;
}

export function separateBuildingIds(models) {
  const ids = new Set();
  for (const model of models) {
    if (model.active === false || !model.replaceProcedural || !model.glb) continue;
    if (model.buildingId) ids.add(model.buildingId);
    for (const id of model.buildingIds ?? []) ids.add(id);
  }
  return ids;
}
