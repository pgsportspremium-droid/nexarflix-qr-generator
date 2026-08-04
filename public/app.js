const $ = (s) => document.querySelector(s);
let password = sessionStorage.getItem('nexar_admin') || '';
let clients = [];
let currentQr = null;
let resolvedMapsUrl = '';
let resolvedReviewUrl = '';
let isResolving = false;

async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-admin-password': password, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
  return data;
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
    .replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32) || 'EMPRESA';
}

function clearResolvedState({ keepMapsUrl = true } = {}) {
  resolvedMapsUrl = '';
  resolvedReviewUrl = '';
  $('#resolvedCard').hidden = true;
  $('#resolvedName').textContent = '—';
  $('#resolvedLocation').textContent = 'Confira o estabelecimento antes de salvar.';
  $('#confirmedBusiness').checked = false;
  if (!keepMapsUrl) $('#mapsUrl').value = '';
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
  $('#saveBtn').textContent = 'Criar QR permanente';
  $('#saveBtn').disabled = false;
  $('#cancelEdit').hidden = true;
  $('#resolverMessage').textContent = '';
  $('#resolverMessage').classList.remove('error');
  clearResolvedState({ keepMapsUrl:false });
  updateTestButton();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function resolveMapsLink() {
  const url = $('#mapsUrl').value.trim();
  const button = $('#resolveMapsBtn');
  const message = $('#resolverMessage');
  if (!url) { message.textContent = 'Cole a URL completa do Google Maps copiada da barra do navegador.'; message.classList.add('error'); return; }

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
    resolvedReviewUrl = result.reviewUrl;
    $('#name').value = result.name || '';
    $('#destination').value = result.reviewUrl;
    $('#code').value = slugifyCode(result.name || '');
    $('#resolvedName').textContent = result.name || 'Estabelecimento identificado';
    $('#resolvedLocation').textContent = result.location?.shortAddress || result.location?.displayName || 'Abra no Maps e confira o endereço correto.';
    $('#resolvedCard').hidden = false;
    message.textContent = 'Dados preenchidos. Agora abra o estabelecimento no Maps, teste a avaliação e confirme antes de criar o QR.';
    updateTestButton();
  } catch (err) {
    message.textContent = `${err.message} Como alternativa, cole o link direto de avaliação no modo manual.`;
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
  const automaticFlow = Boolean(resolvedReviewUrl);
  $('#saveBtn').disabled = isResolving || (!editing && automaticFlow && !$('#confirmedBusiness').checked);
}

$('#destination').addEventListener('input', () => { updateTestButton(); updateSaveAvailability(); });
$('#confirmedBusiness').addEventListener('change', updateSaveAvailability);
$('#testReviewBtn').addEventListener('click', () => {
  const url = $('#destination').value.trim();
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
});
$('#openMapsBtn').addEventListener('click', () => {
  if (resolvedMapsUrl) window.open(resolvedMapsUrl, '_blank', 'noopener,noreferrer');
});
$('#testResolvedReviewBtn').addEventListener('click', () => {
  if (resolvedReviewUrl) window.open(resolvedReviewUrl, '_blank', 'noopener,noreferrer');
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
