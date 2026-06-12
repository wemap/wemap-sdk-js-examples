export type InitialParamsConfig = {
  core: {
    emmid: string;
    token: string;
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
  document.body.appendChild(backdropEl);

  const headerEl = document.createElement('div');
  headerEl.style.cssText =
    'padding:0.75rem 1rem;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;';
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
        <input id="emmId-input" name="emmId" type="text" placeholder="31668" />
      </div>
      <div>
        <label for="token-input">token</label>
        <input id="token-input" name="token" type="password" placeholder="WEMAP_TOKEN" />
      </div>
    </div>
    <p style="margin:0.5rem 0 0;font-size:0.875rem;color:#666;">
      Map style, center, and zoom come from the livemap snippet after <code>core.init()</code>.
    </p>
  `;
  fieldsWrap.appendChild(coreGroup);

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
  const initialDestinationLevelInput = formEl.querySelector<HTMLInputElement>('#initialDestinationLevel-input')!;
  const useStrictInput = formEl.querySelector<HTMLInputElement>('#useStrict-input')!;

  function setConfig(config: InitialParamsConfig) {
    emmIdInput.value = config.core.emmid;
    tokenInput.value = config.core.token;
    initialDestinationLevelInput.value =
      config.routing.initialDestinationLevel === null ? '' : String(config.routing.initialDestinationLevel);
    useStrictInput.checked = config.locationSource.useStrict;
  }

  function getConfig(): InitialParamsConfig {
    const emmid = emmIdInput.value.trim();
    const token = tokenInput.value.trim();
    const initialDestinationLevel = parseOptionalNumber(initialDestinationLevelInput.value);

    if (!emmIdInput.value.trim()) {
      throw new Error('emmId is required');
    }
    if (!token) {
      throw new Error('token is required');
    }

    return {
      core: { emmid, token },
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
