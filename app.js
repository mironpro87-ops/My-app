const STORAGE_KEY = 'realtor:data';
const ACCESS_TRIAL_KEY = 'subscription-site:trial-start';
const ACCESS_SUBSCRIPTION_KEY = 'subscription-site:subscription-start';
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DURATION_MS = 3 * DAY_MS;
const SUBSCRIPTION_DURATION_MS = 30 * DAY_MS;
const MAX_DOC_SIZE = 2 * 1024 * 1024;
const MAX_PHOTO_EDGE = 960;
const TOAST_DURATION_MS = 2500;

const els = {
  tabPropertiesBtn: document.querySelector('#tab-properties-btn'),
  tabDealsBtn: document.querySelector('#tab-deals-btn'),
  tabProperties: document.querySelector('#tab-properties'),
  tabDeals: document.querySelector('#tab-deals'),
  tabYandex: document.querySelector('#tab-yandex'),
  tabCian: document.querySelector('#tab-cian'),
  tabYandexBtn: document.querySelector('#tab-yandex-btn'),
  tabCianBtn: document.querySelector('#tab-cian-btn'),

  filterRooms: document.querySelector('#filter-rooms'),
  filterBudget: document.querySelector('#filter-budget'),
  filterDistrict: document.querySelector('#filter-district'),

  addProperty: document.querySelector('#add-property'),
  propertiesList: document.querySelector('#properties-list'),
  propertiesEmpty: document.querySelector('#properties-empty'),

  addDeal: document.querySelector('#add-deal'),
  dealsList: document.querySelector('#deals-list'),
  dealsEmpty: document.querySelector('#deals-empty'),

  propertyDialog: document.querySelector('#property-dialog'),
  propertyDialogTitle: document.querySelector('#property-dialog-title'),
  propertyForm: document.querySelector('#property-form'),
  propertyPhoto: document.querySelector('#property-photo'),
  photoPreview: document.querySelector('#photo-preview'),
  propertyPrice: document.querySelector('#property-price'),
  propertyAddress: document.querySelector('#property-address'),
  propertyRooms: document.querySelector('#property-rooms'),
  propertyDistrict: document.querySelector('#property-district'),
  propertyDescription: document.querySelector('#property-description'),
  propertyError: document.querySelector('#property-error'),

  dealDialog: document.querySelector('#deal-dialog'),
  dealForm: document.querySelector('#deal-form'),
  dealProperty: document.querySelector('#deal-property'),
  dealClient: document.querySelector('#deal-client'),
  dealPhone: document.querySelector('#deal-phone'),
  dealError: document.querySelector('#deal-error'),

  toast: document.querySelector('#toast'),

  appContent: document.querySelector('#app-content'),
  appLock: document.querySelector('#app-lock'),
  accessStatus: document.querySelector('#access-status'),
};

const priceFormatter = new Intl.NumberFormat('ru-RU');

let state = loadState();
let editingPropertyId = null;
let pendingPhoto = null;
let toastTimer;

const filters = {
  rooms: '',
  budget: '',
  district: '',
};

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { properties: [], deals: [] };

    const data = JSON.parse(raw);
    const properties = Array.isArray(data.properties)
      ? data.properties
          .filter((item) => item && typeof item.id === 'string' && typeof item.address === 'string')
          .map((item) => ({
            id: item.id,
            photo: typeof item.photo === 'string' ? item.photo : null,
            price: Number(item.price) || 0,
            address: item.address,
            rooms: Number(item.rooms) || 0,
            district: typeof item.district === 'string' ? item.district : '',
            description: typeof item.description === 'string' ? item.description : '',
          }))
      : [];

    const deals = Array.isArray(data.deals)
      ? data.deals
          .filter((item) => item && typeof item.id === 'string' && item.property && item.client)
          .map((item) => ({
            id: item.id,
            propertyId: typeof item.propertyId === 'string' ? item.propertyId : '',
            property: {
              address: String(item.property.address || ''),
              price: Number(item.property.price) || 0,
              rooms: Number(item.property.rooms) || 0,
              district: String(item.property.district || ''),
            },
            client: {
              name: String(item.client.name || ''),
              phone: String(item.client.phone || ''),
            },
            documents: Array.isArray(item.documents) ? item.documents : [],
            createdAt: Number(item.createdAt) || Date.now(),
          }))
      : [];

    return { properties, deals };
  } catch {
    return { properties: [], deals: [] };
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    showToast('Не удалось сохранить данные: закончилось место в браузере');
    return false;
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;

  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
    els.toast.textContent = '';
  }, TOAST_DURATION_MS);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char];
  });
}

function formatPrice(value) {
  return `${priceFormatter.format(Number(value) || 0)} ₽`;
}

function roomsLabel(rooms) {
  const count = Number(rooms) || 0;
  if (count === 0) return 'Студия';
  if (count >= 4) return '4+ комн.';
  return `${count} комн.`;
}

function readAccessTimestamp(key) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function getAccessState() {
  const now = Date.now();
  const subscriptionStart = readAccessTimestamp(ACCESS_SUBSCRIPTION_KEY);
  const trialStart = readAccessTimestamp(ACCESS_TRIAL_KEY);
  const subscriptionEndsAt = subscriptionStart
    ? subscriptionStart + SUBSCRIPTION_DURATION_MS
    : null;
  const trialEndsAt = trialStart ? trialStart + TRIAL_DURATION_MS : null;

  if (subscriptionEndsAt && now < subscriptionEndsAt) {
    return { kind: 'subscription', status: 'active', endsAt: subscriptionEndsAt };
  }
  if (trialEndsAt && now < trialEndsAt) {
    return { kind: 'trial', status: 'active', endsAt: trialEndsAt };
  }
  if (subscriptionEndsAt) {
    return { kind: 'subscription', status: 'expired', endsAt: subscriptionEndsAt };
  }
  if (trialEndsAt) {
    return { kind: 'trial', status: 'expired', endsAt: trialEndsAt };
  }
  return { status: 'none' };
}

function pluralDays(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function syncAccess() {
  const access = getAccessState();
  const active = access.status === 'active';

  els.appContent.hidden = !active;
  els.appLock.hidden = active;
  els.accessStatus.hidden = !active;

  if (!active) {
    els.accessStatus.textContent = '';
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    return;
  }

  const days = Math.max(1, Math.ceil((access.endsAt - Date.now()) / DAY_MS));
  const label = access.kind === 'subscription' ? 'Подписка' : 'Пробный период';
  els.accessStatus.textContent = `${label} · ещё ${days} ${pluralDays(days)}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function getVisibleProperties() {
  return state.properties.filter((property) => {
    if (filters.rooms !== '') {
      const wanted = Number(filters.rooms);
      const rooms = Number(property.rooms) || 0;
      if (wanted >= 4 ? rooms < 4 : rooms !== wanted) return false;
    }

    if (filters.budget !== '' && Number(property.price) > Number(filters.budget)) {
      return false;
    }

    if (filters.district !== '' && property.district !== filters.district) {
      return false;
    }

    return true;
  });
}

function propertyCard(property) {
  const photo = property.photo
    ? `<img src="${escapeHtml(property.photo)}" alt="Фото объекта" />`
    : '<span>Нет фото</span>';

  return `<article class="property-card">
    <div class="property-card__photo">${photo}</div>
    <div class="property-card__body">
      <div class="property-card__price">${formatPrice(property.price)}</div>
      <h3 class="property-card__address">${escapeHtml(property.address)}</h3>
      <p class="property-card__meta">${roomsLabel(property.rooms)} · ${escapeHtml(property.district)}</p>
      <p class="property-card__description">${escapeHtml(property.description || 'Без описания')}</p>
      <div class="property-card__actions">
        <button class="btn btn-secondary" type="button" data-edit-property="${property.id}">Редактировать</button>
        <button class="btn btn-secondary btn-danger" type="button" data-delete-property="${property.id}">Удалить</button>
      </div>
    </div>
  </article>`;
}

function renderProperties() {
  const visible = getVisibleProperties();
  els.propertiesList.innerHTML = visible.map(propertyCard).join('');

  if (visible.length === 0) {
    els.propertiesEmpty.hidden = false;
    els.propertiesEmpty.textContent =
      state.properties.length === 0
        ? 'Объектов пока нет. Нажмите «Добавить объект».'
        : 'По выбранным параметрам ничего не найдено.';
  } else {
    els.propertiesEmpty.hidden = true;
  }
}

function updateDistrictFilter() {
  const districts = [...new Set(state.properties.map((property) => property.district).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'ru'),
  );

  const current = filters.district;
  els.filterDistrict.innerHTML =
    '<option value="">Все районы</option>' +
    districts
      .map((district) => `<option value="${escapeHtml(district)}">${escapeHtml(district)}</option>`)
      .join('');

  if (current && districts.includes(current)) {
    els.filterDistrict.value = current;
  } else {
    filters.district = '';
    els.filterDistrict.value = '';
  }
}

function showPropertyError(message) {
  els.propertyError.textContent = message;
  els.propertyError.hidden = false;
}

function showDealError(message) {
  els.dealError.textContent = message;
  els.dealError.hidden = false;
}

function renderPhotoPreview() {
  els.photoPreview.innerHTML = pendingPhoto
    ? `<img src="${pendingPhoto}" alt="Предпросмотр фото" />`
    : '<span>Нет фото</span>';
}

function openPropertyDialog(property = null) {
  editingPropertyId = property ? property.id : null;
  els.propertyDialogTitle.textContent = property ? 'Редактировать объект' : 'Новый объект';
  els.propertyForm.reset();
  els.propertyError.hidden = true;
  pendingPhoto = property && property.photo ? property.photo : null;

  if (property) {
    els.propertyPrice.value = String(property.price);
    els.propertyAddress.value = property.address;
    els.propertyRooms.value = String(property.rooms);
    els.propertyDistrict.value = property.district;
    els.propertyDescription.value = property.description;
  }

  renderPhotoPreview();
  els.propertyDialog.showModal();
  els.propertyPrice.focus();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('read error'));
    reader.readAsDataURL(file);
  });
}

async function resizeImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image error'));
    img.src = dataUrl;
  });

  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.75);
}

function dealCard(deal) {
  const documents = Array.isArray(deal.documents) ? deal.documents : [];
  const documentItems = documents
    .map(
      (document) => `<li>
        <a href="${document.dataUrl}" download="${escapeHtml(document.name)}">${escapeHtml(document.name)}</a>
        <span class="doc-list__size">${formatSize(document.size)}</span>
        <button class="doc-list__remove" type="button" data-remove-doc="${document.id}" data-deal-id="${deal.id}" aria-label="Удалить файл">×</button>
      </li>`,
    )
    .join('');

  return `<article class="deal-card">
    <div class="deal-card__head">
      <h3>${escapeHtml(deal.property.address)}</h3>
      <button class="deal-card__delete" type="button" data-delete-deal="${deal.id}">Удалить</button>
    </div>
    <p class="deal-card__meta">${formatPrice(deal.property.price)} · ${roomsLabel(deal.property.rooms)} · ${escapeHtml(deal.property.district)}</p>
    <p class="deal-card__client">Клиент: <strong>${escapeHtml(deal.client.name)}</strong>${deal.client.phone ? ` · ${escapeHtml(deal.client.phone)}` : ''}</p>
    <div class="deal-docs">
      <div class="deal-docs__head">
        <span>Документы (${documents.length})</span>
        <label class="btn btn-secondary btn-small">
          Загрузить файлы
          <input class="deal-files" type="file" multiple data-deal-id="${deal.id}" hidden />
        </label>
      </div>
      ${documents.length ? `<ul class="doc-list">${documentItems}</ul>` : '<p class="deal-docs__empty">Файлов пока нет</p>'}
    </div>
  </article>`;
}

function renderDeals() {
  els.dealsList.innerHTML = state.deals.map(dealCard).join('');
  els.dealsEmpty.hidden = state.deals.length !== 0;
  els.dealsEmpty.textContent = 'Сделок пока нет. Нажмите «Добавить сделку».';
}

function openDealDialog() {
  if (state.properties.length === 0) {
    showToast('Сначала добавьте объект');
    return;
  }

  els.dealForm.reset();
  els.dealError.hidden = true;
  els.dealProperty.innerHTML = state.properties
    .map((property) => `<option value="${property.id}">${escapeHtml(property.address)} — ${formatPrice(property.price)}</option>`)
    .join('');

  els.dealDialog.showModal();
  els.dealClient.focus();
}

const TABS = () => ({
  properties: { button: els.tabPropertiesBtn, panel: els.tabProperties },
  deals: { button: els.tabDealsBtn, panel: els.tabDeals },
  yandex: { button: els.tabYandexBtn, panel: els.tabYandex },
  cian: { button: els.tabCianBtn, panel: els.tabCian },
});

function setTab(name) {
  Object.entries(TABS()).forEach(([tabName, tab]) => {
    const active = tabName === name;
    tab.panel.hidden = !active;
    tab.button.classList.toggle('is-active', active);
    tab.button.setAttribute('aria-selected', String(active));
  });
}

els.tabPropertiesBtn.addEventListener('click', () => setTab('properties'));
els.tabDealsBtn.addEventListener('click', () => setTab('deals'));
els.tabYandexBtn.addEventListener('click', () => setTab('yandex'));
els.tabCianBtn.addEventListener('click', () => setTab('cian'));

els.filterRooms.addEventListener('change', () => {
  filters.rooms = els.filterRooms.value;
  renderProperties();
});

els.filterBudget.addEventListener('input', () => {
  filters.budget = els.filterBudget.value;
  renderProperties();
});

els.filterDistrict.addEventListener('change', () => {
  filters.district = els.filterDistrict.value;
  renderProperties();
});

els.addProperty.addEventListener('click', () => openPropertyDialog());

els.addDeal.addEventListener('click', openDealDialog);

els.propertyPhoto.addEventListener('change', async () => {
  const file = els.propertyPhoto.files && els.propertyPhoto.files[0];
  els.propertyPhoto.value = '';

  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Выберите файл изображения');
    return;
  }

  try {
    pendingPhoto = await resizeImage(file);
    renderPhotoPreview();
  } catch {
    showToast('Не удалось прочитать изображение');
  }
});

els.propertyForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const price = Number(els.propertyPrice.value);
  const address = els.propertyAddress.value.trim();
  const district = els.propertyDistrict.value.trim();
  const description = els.propertyDescription.value.trim();
  const rooms = Number(els.propertyRooms.value);

  if (!Number.isFinite(price) || price <= 0) {
    showPropertyError('Укажите цену больше нуля');
    return;
  }

  if (!address) {
    showPropertyError('Укажите адрес');
    return;
  }

  if (!district) {
    showPropertyError('Укажите район');
    return;
  }

  const property = {
    id: editingPropertyId || makeId(),
    photo: pendingPhoto,
    price,
    address,
    rooms,
    district,
    description,
  };

  if (editingPropertyId) {
    const index = state.properties.findIndex((item) => item.id === editingPropertyId);
    if (index !== -1) state.properties[index] = property;
  } else {
    state.properties.unshift(property);
  }

  saveState();
  els.propertyDialog.close();
  updateDistrictFilter();
  renderProperties();
  showToast(editingPropertyId ? 'Объект обновлён' : 'Объект добавлен');
  editingPropertyId = null;
});

els.propertiesList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-property]');
  if (editButton) {
    const property = state.properties.find((item) => item.id === editButton.dataset.editProperty);
    if (property) openPropertyDialog(property);
    return;
  }

  const deleteButton = event.target.closest('[data-delete-property]');
  if (!deleteButton) return;
  if (!window.confirm('Удалить объект?')) return;

  state.properties = state.properties.filter((item) => item.id !== deleteButton.dataset.deleteProperty);
  saveState();
  updateDistrictFilter();
  renderProperties();
  showToast('Объект удалён');
});

els.dealForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const property = state.properties.find((item) => item.id === els.dealProperty.value);
  const name = els.dealClient.value.trim();
  const phone = els.dealPhone.value.trim();

  if (!property) {
    showDealError('Выберите объект');
    return;
  }

  if (!name) {
    showDealError('Укажите имя клиента');
    return;
  }

  state.deals.unshift({
    id: makeId(),
    propertyId: property.id,
    property: {
      address: property.address,
      price: property.price,
      rooms: property.rooms,
      district: property.district,
    },
    client: { name, phone },
    documents: [],
    createdAt: Date.now(),
  });

  saveState();
  els.dealDialog.close();
  renderDeals();
  showToast('Сделка создана');
});

els.dealsList.addEventListener('click', (event) => {
  const removeDocumentButton = event.target.closest('[data-remove-doc]');
  if (removeDocumentButton) {
    const deal = state.deals.find((item) => item.id === removeDocumentButton.dataset.dealId);
    if (!deal) return;

    deal.documents = deal.documents.filter((document) => document.id !== removeDocumentButton.dataset.removeDoc);
    saveState();
    renderDeals();
    return;
  }

  const deleteDealButton = event.target.closest('[data-delete-deal]');
  if (!deleteDealButton) return;
  if (!window.confirm('Удалить сделку?')) return;

  state.deals = state.deals.filter((item) => item.id !== deleteDealButton.dataset.deleteDeal);
  saveState();
  renderDeals();
  showToast('Сделка удалена');
});

els.dealsList.addEventListener('change', async (event) => {
  const input = event.target.closest('.deal-files');
  if (!input) return;

  const files = Array.from(input.files || []);
  const dealId = input.dataset.dealId;
  input.value = '';

  if (!files.length) return;

  const deal = state.deals.find((item) => item.id === dealId);
  if (!deal) return;

  const accepted = [];

  for (const file of files) {
    if (file.size > MAX_DOC_SIZE) {
      showToast(`«${file.name}» больше 2 МБ`);
      continue;
    }

    try {
      accepted.push({
        id: makeId(),
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: await readFileAsDataUrl(file),
      });
    } catch {
      showToast(`Не удалось прочитать «${file.name}»`);
    }
  }

  if (accepted.length === 0) return;

  deal.documents.push(...accepted);
  saveState();
  renderDeals();
  showToast(accepted.length === 1 ? 'Документ загружен' : `Загружено файлов: ${accepted.length}`);
});

document.querySelectorAll('.close-dialog').forEach((button) => {
  button.addEventListener('click', () => {
    button.closest('dialog').close();
  });
});

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;

    const rect = dialog.getBoundingClientRect();
    const isOnBackdrop =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (isOnBackdrop) dialog.close();
  });
});

updateDistrictFilter();
renderProperties();
renderDeals();
syncAccess();
window.setInterval(syncAccess, 30000);
document.addEventListener('visibilitychange', syncAccess);
