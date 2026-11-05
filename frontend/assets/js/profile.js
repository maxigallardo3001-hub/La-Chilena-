(function () {
  const COMUNAS = ['Maipú', 'Santiago', 'Ñuñoa', 'Providencia', 'La Florida', 'Puente Alto'];
  const PROVINCIAS = ['Santiago', 'Cordillera', 'Maipo'];
  const REGIONES = ['Metropolitana', 'Valparaíso', 'Biobío'];
  const field = 'width: 100%; border: 1px solid #ccc; padding: 6px; border-radius: 3px;';
  const label = 'display: block; font-size: 13px; font-weight: bold; margin-bottom: 4px;';

  let editingId = null;
  let onSaved = null;

  function options(values) {
    return values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

  function selectValue(select, value) {
    if (value && ![...select.options].some((o) => o.value === value)) {
      select.insertAdjacentHTML('beforeend', `<option value="${esc(value)}">${esc(value)}</option>`);
    }
    select.value = value || select.options[0].value;
  }

  function ensureModal() {
    if (document.getElementById('modal-perfil')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="modal-perfil" class="win-modal-overlay">
        <div class="win-modal" style="width: 480px;">
          <div class="win-modal-header">
            <span><i class="fas fa-id-card"></i> Datos del cliente</span>
            <button type="button" class="win-modal-close" data-close-profile><i class="fas fa-times"></i></button>
          </div>
          <div class="win-modal-body">
            <form id="profileForm">
              <p id="pfIdentity" style="font-size: 13px; color: var(--ink-soft); margin: 0 0 12px;"></p>
              <label style="${label}">Nombre completo</label>
              <input type="text" id="pfName" minlength="2" maxlength="80" style="${field} margin-bottom: 10px;" required>
              <label style="${label}">Dirección</label>
              <input type="text" id="pfAddress" minlength="2" maxlength="120" style="${field} margin-bottom: 10px;" required>
              <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <div style="flex: 1;"><label style="${label}">Comuna</label><select id="pfComuna" style="${field}" required>${options(COMUNAS)}</select></div>
                <div style="flex: 1;"><label style="${label}">Provincia</label><select id="pfProvincia" style="${field}" required>${options(PROVINCIAS)}</select></div>
                <div style="flex: 1;"><label style="${label}">Región</label><select id="pfRegion" style="${field}" required>${options(REGIONES)}</select></div>
              </div>
              <label style="${label}">Teléfono</label>
              <input type="tel" id="pfPhone" placeholder="+56912345678" pattern="^\\+569\\d{8}$" style="${field}" required>
              <p style="font-size: 12px; color: var(--ink-soft); margin: 10px 0 0;">
                El RUN y el correo no se modifican aquí. Los pedidos ya realizados conservan la dirección con la que se crearon.
              </p>
              <button type="submit" style="display: none;"></button>
            </form>
          </div>
          <div class="win-modal-footer">
            <button type="button" class="win-btn" data-close-profile>Cancelar</button>
            <button type="button" class="win-btn win-btn-primary" id="pfSave">Guardar cambios</button>
          </div>
        </div>
      </div>`);

    const modal = document.getElementById('modal-perfil');
    modal.querySelectorAll('[data-close-profile]').forEach((b) => b.addEventListener('click', () => { modal.style.display = 'none'; }));
    document.getElementById('pfSave').addEventListener('click', () => document.getElementById('profileForm').requestSubmit());
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const saved = await API.put(`/clients/${encodeURIComponent(editingId)}`, {
          name: document.getElementById('pfName').value.trim(),
          address: document.getElementById('pfAddress').value.trim(),
          comuna: document.getElementById('pfComuna').value,
          provincia: document.getElementById('pfProvincia').value,
          region: document.getElementById('pfRegion').value,
          phone: document.getElementById('pfPhone').value.trim(),
        });
        modal.style.display = 'none';
        showToast('Datos actualizados.');
        if (onSaved) onSaved(saved);
      } catch (err) {
        showToast(err.userMessage || 'No se pudieron guardar los datos.');
      }
    });
  }

  async function openClientProfile(clientId, saved) {
    ensureModal();
    editingId = clientId;
    onSaved = saved || null;
    try {
      const client = await API.get(`/clients/${encodeURIComponent(clientId)}`);
      document.getElementById('pfIdentity').textContent = `RUN ${client.run} · ${client.email}`;
      document.getElementById('pfName').value = client.name;
      document.getElementById('pfAddress').value = client.address;
      selectValue(document.getElementById('pfComuna'), client.comuna);
      selectValue(document.getElementById('pfProvincia'), client.provincia);
      selectValue(document.getElementById('pfRegion'), client.region);
      document.getElementById('pfPhone').value = client.phone;
      document.getElementById('modal-perfil').style.display = 'flex';
    } catch (err) {
      showToast(err.userMessage || 'No se pudieron cargar los datos del cliente.');
    }
  }

  window.openClientProfile = openClientProfile;
})();
