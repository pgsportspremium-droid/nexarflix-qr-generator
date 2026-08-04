const $ = (s) => document.querySelector(s);
let password = sessionStorage.getItem('nexar_admin') || '';
let clients = [];
let currentQr = null;

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

$('#clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const editing = $('#editingCode').value;
  const payload = { name: $('#name').value, destination: $('#destination').value, code: $('#code').value };
  try {
    if (editing) await api(`client?code=${encodeURIComponent(editing)}`, { method:'PUT', body:JSON.stringify(payload) });
    else await api('clients', { method:'POST', body:JSON.stringify(payload) });
    $('#formMessage').textContent = editing ? 'Empresa atualizada.' : 'Empresa criada e QR permanente disponível.';
    resetForm();
    await loadClients();
  } catch (err) { $('#formMessage').textContent = err.message; }
});

function resetForm(){ $('#clientForm').reset(); $('#editingCode').value=''; $('#code').disabled=false; $('#formTitle').textContent='Nova empresa'; $('#saveBtn').textContent='Criar QR permanente'; $('#cancelEdit').hidden=true; }
$('#cancelEdit').addEventListener('click', resetForm);

$('#clients').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]'); if (!btn) return;
  const c = clients.find(x => x.code === btn.dataset.code); if (!c) return;
  const url = `${location.origin}/r/${c.code}`;
  if (btn.dataset.action === 'copy') { await navigator.clipboard.writeText(url); btn.textContent='Copiado!'; setTimeout(()=>btn.textContent='Copiar',1000); }
  if (btn.dataset.action === 'edit') { $('#editingCode').value=c.code; $('#name').value=c.name; $('#destination').value=c.destination; $('#code').value=c.code; $('#code').disabled=true; $('#formTitle').textContent='Editar empresa'; $('#saveBtn').textContent='Salvar alterações'; $('#cancelEdit').hidden=false; scrollTo({top:0,behavior:'smooth'}); }
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
$('#downloadQr').addEventListener('click',()=>{
  if (!currentQr) return;
  const a=document.createElement('a');
  a.download=`QR-${currentQr.code}-${currentQr.name.replace(/[^a-z0-9]+/gi,'-')}.png`;
  a.href=`/api/qr?text=${encodeURIComponent(currentQr.url)}&code=${encodeURIComponent(currentQr.code)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

if (password) showApp();
