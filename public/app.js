const $ = (s) => document.querySelector(s);
let password = sessionStorage.getItem('nexar_admin') || '';
let clients = [];
let currentQr = null;
let resolvedMapsUrl = '';
let resolvedReviewUrl = '';
let resolvedFeatureId = '';
let resolvedLudocid = '';
let resolvedLocationText = '';
let resolvedOfficial = false;
let isResolving = false;
let lastDiagnostics = null;

async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-admin-password': password, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(data.error || 'Erro inesperado.'); error.data = data; throw error; }
  return data;
}


function renderDiagnostics(diag = null) {
  lastDiagnostics = diag || null;
  const panel = $('#diagnosticsPanel');
  if (!panel) return;
  if (!diag) { panel.hidden = true; panel.open = false; return; }
  panel.hidden = false;
  $('#diagInput').textContent = diag.inputUrl || '—';
  $('#diagFinal').textContent = diag.finalUrl || '—';
  $('#diagName').textContent = diag.name || 'não informado pelo Google';
  $('#diagFeature').textContent = diag.featureId || 'não encontrado';
  $('#diagPlace').textContent = diag.placeId || 'não encontrado';
  $('#diagMode').textContent = diag.reviewMode || '—';
  const trace = Array.isArray(diag.trace) ? diag.trace : [];
  $('#diagTrace').textContent = trace.length
    ? trace.map(item => `${item.step}. HTTP ${item.status}\n${item.url}${item.location ? `\n→ ${item.location}` : ''}`).join('\n\n')
    : 'A URL já continha os identificadores; nenhum redirecionamento foi necessário.';
}
function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  loadClients();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  password = $('#password').value;
  try {
    await api('login', { method: 'POST', body: '{}' });
    sessionStorage.setItem('nexar_admin', password);
    $('#loginError').textContent = '';
    showApp();
  } catch (err) { $('#loginError').textContent = err.message; }
});

$('#logoutBtn').addEventListener('click', () => { sessionStorage.removeItem('nexar_admin'); location.reload(); });

async function loadClients() {
  try {
    clients = (await api('clients')).clients;
    render();
  } catch (err) {
    if (err.message.includes('Senha')) { sessionStorage.removeItem('nexar_admin'); location.reload(); }
    else $('#formMessage').textContent = err.message;
  }
}

function render() {
  const term = $('#search').value.toLowerCase();
  const filtered = clients.filter(c => c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term));
  $('#totalClients').textContent = clients.length;
  $('#totalAccesses').textContent = clients.reduce((s,c)=>s+Number(c.accesses||0),0);
  const last = clients.map(c=>c.lastAccessAt).filter(Boolean).sort().at(-1);
  $('#lastAccess').textContent = last ? new Date(last).toLocaleDateString('pt-BR') : '—';
  $('#clients').innerHTML = filtered.length ? filtered.map(c => `
    <article class="client">
      <div><h3>${escapeHtml(c.name)}</h3><p>${location.origin}/r/${c.code}</p><p>Destino: ${escapeHtml(c.destination)}</p></div>
      <div class="metric"><small>Acessos</small><strong>${c.accesses || 0}</strong><small>${c.lastAccessAt ? 'Último: '+new Date(c.lastAccessAt).toLocaleString('pt-BR') : 'Nenhum acesso'}</small></div>
      <div class="client-actions">
        <button data-action="qr" data-code="${c.code}">QR</button>
        <button class="ghost" data-action="edit" data-code="${c.code}">Editar</button>
        <button class="ghost" data-action="copy" data-code="${c.code}">Copiar</button>
        <button class="danger" data-action="delete" data-code="${c.code}">Excluir</button>
      </div>
    </article>`).join('') : '<p>Nenhuma empresa encontrada.</p>';
}

function escapeHtml(v='') { return v.replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
$('#search').addEventListener('input', render);

function slugifyCode(name='') {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
    .replace(/\b(RESTAURANTE|LANCHONETE|PIZZARIA|HOTEL|POUSADA|BAR|LOJA|CLINICA|ACADEMIA)\b/g,' ')
    .replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
}

function buildFallbackReviewUrl() {
  const name = $('#name').value.trim();
  if (!resolvedFeatureId || !resolvedLudocid || !name) return '';
  const query = [name, resolvedLocationText].filter(Boolean).join(' - ');
  const params = new URLSearchParams({ hl:'pt-BR', gl:'br', q:query, ludocid:resolvedLudocid });
  return `https://www.google.com/search?${params.toString()}#lrd=${resolvedFeatureId},3`;
}

function refreshFallbackFromName() {
  if (resolvedOfficial || !resolvedFeatureId) return;
  const generated = buildFallbackReviewUrl();
  resolvedReviewUrl = generated;
  $('#destination').value = generated;
  if (!$('#code').value || $('#code').value === 'EMPRESA') $('#code').value = slugifyCode($('#name').value);
  $('#resolvedName').textContent = $('#name').value.trim() || 'Informe o nome da empresa';
  updateTestButton();
  updateSaveAvailability();
}

function clearResolvedState({ keepMapsUrl = true } = {}) {
  resolvedMapsUrl = '';
  resolvedReviewUrl = '';
  resolvedFeatureId = '';
  resolvedLudocid = '';
  resolvedLocationText = '';
  resolvedOfficial = false;
  $('#resolvedCard').hidden = true;
  $('#resolvedName').textContent = '—';
  $('#resolvedMethod').textContent = 'Empresa identificada';
  $('#resolvedLocation').textContent = 'Confira o estabelecimento antes de salvar.';
  $('#confirmedBusiness').checked = false;
  if (!keepMapsUrl) $('#mapsUrl').value = '';
  renderDiagnostics(null);
  updateSaveAvailability();
}

function clearCompanyFields() {
  $('#name').value = '';
  $('#destination').value = '';
  $('#code').value = '';
  $('#formMessage').textContent = '';
  updateTestButton();
}

function beginNewCompany() {
  $('#clientForm').reset();
  $('#mapsUrl').value = '';
  $('#editingCode').value = '';
  $('#code').disabled = false;
  $('#formTitle').textContent = 'Nova empresa';
  $('#manualMode').open = false;
  $('#saveBtn').textContent = 'Criar QR permanente';
  $('#saveBtn').disabled = false;
  $('#cancelEdit').hidden = true;
  $('#resolverMessage').textContent = '';
  $('#resolverMessage').classList.remove('error');
  renderDiagnostics(null);
  clearResolvedState({ keepMapsUrl:false });
  updateTestButton();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function resolveMapsLink() {
  let url = $('#mapsUrl').value.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
    $('#mapsUrl').value = url;
  }
  const button = $('#resolveMapsBtn');
  const message = $('#resolverMessage');
  if (!url) { message.textContent = 'Cole um link do Google Maps, da Busca Google ou um link direto de avaliação.'; message.classList.add('error'); return; }

  // Uma nova conversão sempre substitui os dados anteriores, evitando mistura entre empresas.
  clearCompanyFields();
  clearResolvedState();
  isResolving = true;
  button.disabled = true;
  button.textContent = 'Analisando...';
  message.textContent = 'Identificando o estabelecimento e preparando o link de avaliação...';
  message.classList.remove('error');
  updateSaveAvailability();

  try {
    const result = await api('resolve-maps', { method:'POST', body:JSON.stringify({ url }) });
    resolvedMapsUrl = result.resolvedUrl || url;
    resolvedFeatureId = result.featureId || '';
    resolvedLudocid = result.ludocid || '';
    resolvedLocationText = result.locationText || result.location?.shortAddress || '';
    resolvedOfficial = Boolean(result.official);
    resolvedReviewUrl = result.reviewUrl || '';
    renderDiagnostics(result.diagnostics || null);

    $('#name').value = result.name || '';
    $('#destination').value = resolvedReviewUrl;
    $('#code').value = slugifyCode(result.name || '');
    $('#resolvedName').textContent = result.name || 'Informe o nome da empresa';
    $('#resolvedMethod').textContent = result.official
      ? 'Link oficial identificado por Place ID'
      : 'Estabelecimento identificado por CID público';
    $('#resolvedLocation').textContent = result.location?.shortAddress || result.location?.displayName || 'Abra no Maps e confira o endereço correto.';
    $('#resolvedCard').hidden = false;

    if (result.needsName) {
      $('#manualMode').open = true;
      message.textContent = 'O Google identificou o local, mas não informou o nome. Digite o nome exato da empresa abaixo; o link será montado automaticamente.';
      $('#name').focus();
    } else if (result.official) {
      message.textContent = 'Link oficial de avaliação identificado. Confira no Maps e teste no celular antes de criar o QR.';
    } else {
      message.textContent = 'Link alternativo montado pelo identificador público. Confira no Maps e teste no celular antes de criar o QR.';
    }
    updateTestButton();
  } catch (err) {
    renderDiagnostics(err.data?.diagnostics || null);
    message.textContent = err.message;
    if (!/share\.google/i.test(url)) message.textContent += ' Como alternativa, cole o link direto de avaliação no modo manual.';
    message.classList.add('error');
  } finally {
    isResolving = false;
    button.disabled = false;
    button.textContent = 'Preencher automaticamente';
    updateSaveAvailability();
  }
}

$('#resolveMapsBtn').addEventListener('click', resolveMapsLink);
$('#mapsUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); resolveMapsLink(); } });
$('#mapsUrl').addEventListener('input', () => {
  if (resolvedMapsUrl || $('#destination').value || $('#name').value) {
    clearCompanyFields();
    clearResolvedState();
    $('#resolverMessage').textContent = 'Nova URL detectada. Clique em Preencher automaticamente para substituir os dados anteriores.';
    $('#resolverMessage').classList.remove('error');
  }
});

function updateTestButton() {
  const value = $('#destination').value.trim();
  $('#testReviewBtn').disabled = !/^https?:\/\//i.test(value);
}
function updateSaveAvailability() {
  const editing = Boolean($('#editingCode').value);
  const automaticFlow = Boolean(resolvedFeatureId || resolvedOfficial);
  const missingRequired = !$('#name').value.trim() || !$('#destination').value.trim();
  $('#saveBtn').disabled = isResolving || missingRequired || (!editing && automaticFlow && !$('#confirmedBusiness').checked);
}

$('#name').addEventListener('input', refreshFallbackFromName);
$('#destination').addEventListener('input', () => { resolvedReviewUrl = $('#destination').value.trim(); updateTestButton(); updateSaveAvailability(); });
$('#confirmedBusiness').addEventListener('change', updateSaveAvailability);
function openExternal(url, errorTarget = '#formMessage') {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) {
    const target = $(errorTarget);
    if (target) target.textContent = 'O link de avaliação ainda não foi gerado. Informe o nome ou use o link oficial no modo manual.';
    return;
  }
  // An anchor click is more reliable than window.open in Safari/iPhone and
  // avoids a silent no-op when popup protection is enabled.
  const a = document.createElement('a');
  a.href = value;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

$('#testReviewBtn').addEventListener('click', () => openExternal($('#destination').value, '#formMessage'));
$('#openMapsBtn').addEventListener('click', () => {
  if (resolvedMapsUrl) openExternal(resolvedMapsUrl, '#resolverMessage');
});
$('#testResolvedReviewBtn').addEventListener('click', () => {
  openExternal(resolvedReviewUrl, '#resolverMessage');
});

$('#clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const editing = $('#editingCode').value;
  if (!editing && resolvedReviewUrl && !$('#confirmedBusiness').checked) {
    $('#formMessage').textContent = 'Antes de criar o QR, confirme que abriu o estabelecimento correto e que a caixa de avaliação funcionou.';
    return;
  }
  const payload = { name: $('#name').value, destination: $('#destination').value, code: $('#code').value };
  const originalText = $('#saveBtn').textContent;
  $('#saveBtn').disabled = true;
  $('#saveBtn').textContent = editing ? 'Salvando...' : 'Gerando...';
  try {
    let saved;
    if (editing) saved = await api(`client?code=${encodeURIComponent(editing)}`, { method:'PUT', body:JSON.stringify(payload) });
    else saved = await api('clients', { method:'POST', body:JSON.stringify(payload) });
    await loadClients();
    const created = clients.find(c => c.code === (saved.client?.code || payload.code.toUpperCase())) || saved.client;
    $('#formMessage').textContent = editing ? 'Empresa atualizada.' : 'QR criado com sucesso.';
    if (!editing && created) openQr(created);
    resetForm();
  } catch (err) {
    $('#formMessage').textContent = err.message;
  } finally {
    $('#saveBtn').textContent = originalText;
    updateSaveAvailability();
  }
});

function resetForm(){
  $('#clientForm').reset();
  $('#mapsUrl').value='';
  $('#testReviewBtn').disabled=true;
  $('#resolverMessage').textContent='';
  $('#resolverMessage').classList.remove('error');
  renderDiagnostics(null);
  $('#editingCode').value='';
  $('#code').disabled=false;
  $('#formTitle').textContent='Nova empresa';
  $('#saveBtn').textContent='Criar QR permanente';
  $('#cancelEdit').hidden=true;
  clearResolvedState({ keepMapsUrl:false });
}
$('#cancelEdit').addEventListener('click', resetForm);
$('#newCompanyBtn').addEventListener('click', beginNewCompany);

$('#clients').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]'); if (!btn) return;
  const c = clients.find(x => x.code === btn.dataset.code); if (!c) return;
  const url = `${location.origin}/r/${c.code}`;
  if (btn.dataset.action === 'copy') { await navigator.clipboard.writeText(url); btn.textContent='Copiado!'; setTimeout(()=>btn.textContent='Copiar',1000); }
  if (btn.dataset.action === 'edit') {
    clearResolvedState({ keepMapsUrl:false });
    $('#editingCode').value=c.code; $('#name').value=c.name; $('#destination').value=c.destination; updateTestButton(); $('#code').value=c.code; $('#code').disabled=true; $('#formTitle').textContent='Editar empresa'; $('#saveBtn').textContent='Salvar alterações'; $('#cancelEdit').hidden=false; updateSaveAvailability(); scrollTo({top:0,behavior:'smooth'});
  }
  if (btn.dataset.action === 'delete' && confirm(`Excluir ${c.name}? O QR deixará de funcionar.`)) { await api(`client?code=${encodeURIComponent(c.code)}`, {method:'DELETE'}); await loadClients(); }
  if (btn.dataset.action === 'qr') openQr(c);
});

function openQr(c) {
  currentQr = { name:c.name, url:`${location.origin}/r/${c.code}`, code:c.code };
  $('#qrTitle').textContent = c.name;
  $('#qrUrl').textContent = currentQr.url;
  $('#qrImage').src = `/api/qr?text=${encodeURIComponent(currentQr.url)}&code=${encodeURIComponent(c.code)}`;
  $('#qrDialog').showModal();
}
$('#closeDialog').addEventListener('click',()=>$('#qrDialog').close());
$('#copyQr').addEventListener('click', async()=>{ await navigator.clipboard.writeText(currentQr.url); $('#copyQr').textContent='Copiado!'; setTimeout(()=>$('#copyQr').textContent='Copiar link',1000); });
$('#testQr').addEventListener('click',()=>{ if (currentQr) window.open(currentQr.url,'_blank','noopener,noreferrer'); });
$('#dialogNewCompany').addEventListener('click',()=>{ $('#qrDialog').close(); beginNewCompany(); });
$('#downloadQr').addEventListener('click',()=>{
  if (!currentQr) return;
  const a=document.createElement('a');
  a.download=`QR-${currentQr.code}-${currentQr.name.replace(/[^a-z0-9]+/gi,'-')}.png`;
  a.href=`/api/qr?text=${encodeURIComponent(currentQr.url)}&code=${encodeURIComponent(currentQr.code)}`;
  document.body.appendChild(a); a.click(); a.remove();
});

if (password) showApp();
