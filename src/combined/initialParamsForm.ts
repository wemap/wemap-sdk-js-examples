export type InitialParamsConfig = {
  core: {
    emmid: string;
    token: string;
  };
  map: {
    styleUrl: string;
    center: {
      lat: number;
      lon: number;
    };
    zoom: number;
  };
  routing: {
    /**
     * Optional initial destination level.
     * If `null`, destination level input will be cleared/left empty.
     */
    initialDestinationLevel: number | null;
  };
  locationSource: {
    /** MapMatching strict mode. */
    useStrict: boolean;
  };
};

export type CreateInitialParamsFormOptions = {
  container: HTMLElement;
  defaults: InitialParamsConfig;
  onApply: (config: InitialParamsConfig) => void;
};

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Mounts a compact “Initial Parameters” button. Clicking it opens a modal form and calls `onApply` on submit.
 * Intentionally does not depend on any specific example DOM besides the container.
 */
export function createInitialParamsForm(options: CreateInitialParamsFormOptions): {
  getConfig: () => InitialParamsConfig;
  setConfig: (config: InitialParamsConfig) => void;
  destroy: () => void;
} {
  const { container, defaults, onApply } = options;

  container.innerHTML = '';

  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'btn btn-primary';
  triggerBtn.textContent = 'Initial Parameters';
  container.appendChild(triggerBtn);

  const backdropEl = document.createElement('div');
  backdropEl.style.cssText =
    'position:fixed;left:0;right:0;top:0;bottom:0;z-index:9999;' +
    'background:rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center;' +
    'padding:1rem;';

  const modalEl = document.createElement('div');
  modalEl.style.cssText =
    'background:#fff;border-radius:8px;max-width:900px;width:100%;' +
    'box-shadow:0 10px 40px rgba(0,0,0,0.25);overflow:auto;';
  backdropEl.appendChild(modalEl);
  // Append to body so it overlays the whole page regardless of container placement.
  document.body.appendChild(backdropEl);

  const headerEl = document.createElement('div');
  headerEl.style.cssText = 'padding:0.75rem 1rem;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;';
  modalEl.appendChild(headerEl);

  const titleEl = document.createElement('h3');
  titleEl.className = 'section-title';
  titleEl.style.cssText = 'font-size:1.1rem;margin:0;';
  titleEl.textContent = 'Initial Parameters';
  headerEl.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.style.cssText =
    'border:none;background:transparent;font-size:1.5rem;line-height:1;cursor:pointer;color:#444;';
  headerEl.appendChild(closeBtn);

  const formEl = document.createElement('form');
  formEl.style.margin = '0';
  modalEl.appendChild(formEl);

  const bodyWrap = document.createElement('div');
  bodyWrap.style.cssText = 'padding:0.75rem 1rem;';
  formEl.appendChild(bodyWrap);

  const fieldsWrap = document.createElement('div');
  fieldsWrap.style.padding = '0';
  bodyWrap.appendChild(fieldsWrap);

  const coreGroup = document.createElement('div');
  coreGroup.className = 'form-group';
  coreGroup.innerHTML = `
    <div class="form-row">
      <div>
        <label for="emmId-input">emmId</label>
        <input id="emmId-input" name="emmId" type="text" placeholder="30265" />
      </div>
      <div>
        <label for="token-input">token</label>
        <input id="token-input" name="token" type="password" placeholder="WEMAP_TOKEN" />
      </div>
    </div>
  `;
  fieldsWrap.appendChild(coreGroup);

  const mapGroup = document.createElement('div');
  mapGroup.className = 'form-group';
  mapGroup.innerHTML = `
    <label for="mapStyleUrl-input">Map style URL</label>
    <input id="mapStyleUrl-input" name="mapStyleUrl" type="text" placeholder="https://tiles.getwemap.com/styles/wemap-v2-fr.json" />
    <div class="form-row" style="margin-top: 0.5rem;">
      <div>
        <label for="centerLat-input">Center latitude</label>
        <input id="centerLat-input" name="centerLat" type="number" step="0.000001" />
      </div>
      <div>
        <label for="centerLon-input">Center longitude</label>
        <input id="centerLon-input" name="centerLon" type="number" step="0.000001" />
      </div>
    </div>
    <div style="margin-top: 0.5rem;">
      <label for="zoom-input">Zoom</label>
      <input id="zoom-input" name="zoom" type="number" step="0.1" />
    </div>
  `;
  fieldsWrap.appendChild(mapGroup);

  const routingGroup = document.createElement('div');
  routingGroup.className = 'form-group';
  routingGroup.innerHTML = `
    <label for="initialDestinationLevel-input">Initial destination level (optional)</label>
    <input id="initialDestinationLevel-input" name="initialDestinationLevel" type="number" step="1" placeholder="Leave blank for none" />
  `;
  fieldsWrap.appendChild(routingGroup);

  const locationGroup = document.createElement('div');
  locationGroup.className = 'form-group';
  locationGroup.innerHTML = `
    <label for="useStrict-input" style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
      <input id="useStrict-input" name="useStrict" type="checkbox" />
      Strict map matching (useStrict)
    </label>
  `;
  fieldsWrap.appendChild(locationGroup);

  const actions = document.createElement('div');
  actions.className = 'button-group';
  actions.style.marginTop = '0.35rem';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'submit';
  applyBtn.className = 'btn btn-primary';
  applyBtn.textContent = 'Apply';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn';
  resetBtn.style.background = '#f5f5f5';
  resetBtn.textContent = 'Reset';

  actions.appendChild(applyBtn);
  actions.appendChild(resetBtn);
  fieldsWrap.appendChild(actions);

  const emmIdInput = formEl.querySelector<HTMLInputElement>('#emmId-input')!;
  const tokenInput = formEl.querySelector<HTMLInputElement>('#token-input')!;
  const mapStyleUrlInput = formEl.querySelector<HTMLInputElement>('#mapStyleUrl-input')!;
  const centerLatInput = formEl.querySelector<HTMLInputElement>('#centerLat-input')!;
  const centerLonInput = formEl.querySelector<HTMLInputElement>('#centerLon-input')!;
  const zoomInput = formEl.querySelector<HTMLInputElement>('#zoom-input')!;
  const initialDestinationLevelInput = formEl.querySelector<HTMLInputElement>('#initialDestinationLevel-input')!;
  const useStrictInput = formEl.querySelector<HTMLInputElement>('#useStrict-input')!;

  function setConfig(config: InitialParamsConfig) {
    emmIdInput.value = config.core.emmid;
    tokenInput.value = config.core.token;
    mapStyleUrlInput.value = config.map.styleUrl;
    centerLatInput.value = String(config.map.center.lat);
    centerLonInput.value = String(config.map.center.lon);
    zoomInput.value = String(config.map.zoom);
    initialDestinationLevelInput.value =
      config.routing.initialDestinationLevel === null ? '' : String(config.routing.initialDestinationLevel);
    useStrictInput.checked = config.locationSource.useStrict;
  }

  function getConfig(): InitialParamsConfig {
    const emmid = emmIdInput.value.trim();
    const token = tokenInput.value.trim();
    const styleUrl = mapStyleUrlInput.value.trim();
    const centerLat = Number(centerLatInput.value);
    const centerLon = Number(centerLonInput.value);
    const zoom = Number(zoomInput.value);
    const initialDestinationLevel = parseOptionalNumber(initialDestinationLevelInput.value);

    if (!emmIdInput.value.trim()) {
      throw new Error('emmId is required');
    }
    if (!token) {
      throw new Error('token is required');
    }
    if (!styleUrl) {
      throw new Error('Map style URL is required');
    }
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
      throw new Error('Center latitude/longitude must be valid numbers');
    }
    if (!Number.isFinite(zoom)) {
      throw new Error('Zoom must be a valid number');
    }

    return {
      core: { emmid, token },
      map: {
        styleUrl,
        center: { lat: centerLat, lon: centerLon },
        zoom,
      },
      routing: {
        initialDestinationLevel,
      },
      locationSource: {
        useStrict: useStrictInput.checked,
      },
    };
  }

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const config = getConfig();
    onApply(config);
    closeModal();
  });

  resetBtn.addEventListener('click', () => setConfig(defaults));

  function openModal() {
    backdropEl.style.display = 'flex';
    // Prevent background scroll while modal is open.
    document.body.style.overflow = 'hidden';
    emmIdInput.focus();
  }

  function closeModal() {
    backdropEl.style.display = 'none';
    document.body.style.overflow = '';
  }

  triggerBtn.addEventListener('click', () => openModal());
  closeBtn.addEventListener('click', () => closeModal());
  backdropEl.addEventListener('click', (e) => {
    if (e.target === backdropEl) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdropEl.style.display !== 'none') {
      closeModal();
    }
  });

  setConfig(defaults);

  return {
    getConfig,
    setConfig,
    destroy: () => {
      container.innerHTML = '';
      backdropEl.remove();
    },
  };
}

