const SUPABASE_URL = 'https://oqmomudrplcxgldbrwvl.supabase.co';
// He usado la clave 'anon public' (JWT) para asegurar la compatibilidad máxima
const SUPABASE_KEY = 'sb_publishable_oVFMjR0Upwl6IXV3yD9c7Q_DAFcaphz';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class AndradeApp {
    constructor() {
        this.uid = localStorage.getItem('andrade_uid');
        this.initDOM();
        if (this.uid) this.initSession(); else this.showAuth();
    }

    initDOM() {
        this.$ = (id) => document.getElementById(id);
        this.els = {
            auth: this.$('auth-overlay'),
            app: this.$('app-shell'),
            views: document.querySelectorAll('.view'),
            // Selector unificado para sidebar y dock flotante
            nav: document.querySelectorAll('.nav-item, .dock-item'),
            greeting: this.$('greeting'),
            progressTotal: this.$('xp-ring-fill'),
            toast: this.$('toast-notify'),
            modal: this.$('modal-container'),
            modalForm: this.$('app-modal-form')
        };
    }

    showAuth() {
        this.els.auth.classList.remove('hidden');
        this.$('auth-form').onsubmit = (e) => {
            e.preventDefault();
            const nick = this.$('auth-nickname').value.trim();
            if (nick) {
                localStorage.setItem('andrade_uid', nick);
                this.uid = nick;
                this.initSession();
                this.els.auth.classList.add('hidden');
                this.notify(`Conexión Establecida`);
            }
        };
    }

    async initSession() {
        console.log("🚀 ANDRADE PRO: Iniciando sesión para:", this.uid);
        
        // MOSTRAR APP DE INMEDIATO (UX fluida)
        this.els.app.classList.remove('hidden');
        this.els.auth.classList.add('hidden');
        
        this.loadLocalState();
        this.setupHandlers();
        this.updateDate();
        this.renderAll();

        // INTENTO DE SINCRONIZACIÓN REMOTA (Segundo plano)
        try {
            await this.syncRemoteState();
            this.renderAll();
        } catch (e) {
            console.warn("⚠️ Offline Mode:", e.message);
        }

        try { this.syncRealtime(); } catch(e) {}
    }

    loadLocalState() {
        const key = `and_data_${this.uid}`;
        const localRaw = JSON.parse(localStorage.getItem(key)) || {};
        const defaults = {
            xp: 0, level: 1, streak: 0,
            habits: [
                { name: "💧 Hidratación", det: "Beber 2 litros de agua", done: false },
                { name: "🏃‍♂️ Movimiento", det: "30 min. de actividad física", done: false },
                { name: "📚 Aprendizaje", det: "Leer 10 páginas", done: false },
                { name: "🧘 Mentalidad", det: "10 min. de meditación / paz", done: false }
            ],
            goals: [
                { name: "Disciplina Diaria", cur: 0, target: 7 }
            ],
            metrics: [20, 45, 60, 35, 80, 55, 40],
            lastDate: new Date().toDateString()
        };

        this.state = { ...defaults, ...localRaw };
        
        // Si no hay datos guardados previos, asegurar que se carguen los defaults
        if (!localRaw.habits || localRaw.habits.length === 0 && this.state.xp === 0) {
            this.state.habits = defaults.habits;
            this.state.goals = defaults.goals;
        }

        if (this.state.lastDate !== new Date().toDateString()) {
            this.state.habits.forEach(h => h.done = false);
            this.state.lastDate = new Date().toDateString();
            this.save(true);
        }
    }

    async syncRemoteState() {
        if (!this.uid) return;
        const { data, error } = await sb.from('warriors').select('*').eq('uid', this.uid).single();
        if (data) {
            this.state = { ...this.state, ...data.state_json };
            localStorage.setItem(`and_data_${this.uid}`, JSON.stringify(this.state));
        } else if (error && error.code === 'PGRST116') {
            await this.saveRemote();
        }
    }

    setupHandlers() {
        this.els.nav.forEach(el => el.onclick = (e) => {
            e.preventDefault();
            // Soporte para IDs (sidebar) y data-view (dock movil)
            const v = el.id ? el.id.replace('nav-', '') : el.getAttribute('data-view');
            this.switchView(v);
        });

        this.$('logout-btn').onclick = () => { localStorage.removeItem('andrade_uid'); location.reload(); };
        this.$('reset-btn').onclick = () => { if (confirm('¿Reiniciar todo?')) { localStorage.clear(); location.reload(); } };

        this.$('add-habit-dash').onclick = () => this.openModal('habit');
        this.$('add-goal-dash').onclick = () => this.openModal('goal');
        this.$('modal-close-btn').onclick = () => this.els.modal.classList.add('hidden');
        this.els.modalForm.onsubmit = (e) => this.saveModal(e);
    }

    renderAll() {
        const s = this.state;
        this.els.greeting.innerText = `¡Hola, ${this.uid}!`;
        this.$('topbar-name').innerText = this.uid;
        this.$('sidebar-name').innerText = this.uid;
        this.$('topbar-level-val').innerText = `Nivel ${s.level}`;
        this.$('topbar-xp-total').innerText = s.xp.toLocaleString();
        
        this.$('dash-xp').innerText = s.xp.toLocaleString();
        this.$('dash-streak').innerText = s.streak;

        const done = s.habits.filter(h => h.done).length;
        const total = s.habits.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        this.$('dash-daily').innerText = pct + '%';

        this.renderHabits();
        this.renderGoals();
        this.renderLeaderboard();
        this.renderChart();

        const ringPct = (s.xp % 1000) / 10;
        this.els.progressTotal.setAttribute('stroke-dasharray', `${ringPct}, 100`);

        const av = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${this.uid}&backgroundColor=00f2ff,3d5afe`;
        this.$('sidebar-avatar').src = av;
        this.$('topbar-avatar').src = av;
    }

    renderHabits() {
        const c = this.$('habits-dash-list');
        c.innerHTML = this.state.habits.length ? '' : '<p class="empty-state">No hay misiones activas.</p>';
        this.state.habits.forEach((h, i) => {
            const el = document.createElement('div');
            el.className = `habit-item ${h.done ? 'done' : ''} pro-item`;
            el.innerHTML = `<div class="habit-check"></div><div style="flex:1"><div class="habit-name">${h.name}</div><div class="habit-det">${h.det || 'Misión Diaria'}</div></div>`;
            el.onclick = () => this.toggleHabit(i);
            c.appendChild(el);
        });
    }

    renderGoals() {
        const c = this.$('goals-dash-list');
        c.innerHTML = this.state.goals.length ? '' : '<p class="empty-state">Sin objetivos.</p>';
        this.state.goals.forEach((g, i) => {
            const el = document.createElement('div');
            el.className = 'goal-pro-card';
            const progress = Math.min((g.cur / g.target) * 100, 100);
            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:12px"><span style="font-weight:700">${g.name}</span><strong style="color:var(--accent)">${g.cur}/${g.target}</strong></div>
                <div class="progress-bg"><div class="progress-bar" style="width:${progress}%"></div></div>
                <div style="display:flex; gap:10px; margin-top:15px">
                    <button class="btn-primary" style="padding:0.4rem; flex:1" onclick="event.stopPropagation(); app.modGoal(${i}, 1)">+1</button>
                    <button class="btn-ghost" style="padding:0.4rem 1rem" onclick="event.stopPropagation(); app.delGoal(${i})">✕</button>
                </div>`;
            c.appendChild(el);
        });
    }

    async toggleHabit(i) {
        const h = this.state.habits[i];
        h.done = !h.done;
        if (h.done) { this.awardXP(100); this.notify('+100 XP Misión'); } else this.awardXP(-100);
        await this.save();
    }

    async modGoal(i, val) {
        const g = this.state.goals[i];
        g.cur = Math.min(g.cur + val, g.target);
        if (g.cur === g.target) { this.awardXP(500); this.notify('🏆 ¡OBJETIVO LOGRADO!'); } else this.awardXP(25);
        await this.save();
    }

    async delGoal(i) { if(confirm('¿Eliminar?')) { this.state.goals.splice(i, 1); await this.save(); } }

    awardXP(val) {
        this.state.xp = Math.max(0, this.state.xp + val);
        const newLvl = Math.floor(this.state.xp / 1000) + 1;
        if (newLvl > this.state.level) { this.state.level = newLvl; this.notify(`🌟 NIVEL ${newLvl}`); }
        if(val > 0) this.showXPPop(val);
    }

    openModal(type) {
        this.currModal = type;
        this.els.modal.classList.remove('hidden');
        this.$('modal-title').innerText = type === 'habit' ? 'Nueva Misión' : 'Nuevo Objetivo';
        this.$('modal-input-1').focus();
    }

    async saveModal(e) {
        e.preventDefault();
        const v1 = this.$('modal-input-1').value;
        const v2 = this.$('modal-input-2').value;
        if (this.currModal === 'habit') this.state.habits.push({ name: v1, det: v2, done: false });
        else this.state.goals.push({ name: v1, cur: 0, target: parseInt(v2) || 10 });
        this.els.modal.classList.add('hidden');
        this.els.modalForm.reset();
        await this.save();
    }

    switchView(v) {
        this.els.views.forEach(el => {
            el.classList.add('hidden');
            if (el.id === `view-${v}`) {
                el.classList.remove('hidden');
                // Reiniciar animación fade-in-up
                el.style.animation = 'none';
                el.offsetHeight; // trigger reflow
                el.style.animation = null;
            }
        });
        this.els.nav.forEach(el => {
            const active = el.id === `nav-${v}` || el.getAttribute('data-view') === v;
            el.classList.toggle('active', active);
        });
        this.renderAll();
    }

    async save(onlyLocal = false) {
        localStorage.setItem(`and_data_${this.uid}`, JSON.stringify(this.state));
        this.renderAll();
        if (!onlyLocal) { try { await this.saveRemote(); } catch(e) {} }
    }

    async saveRemote() {
        await sb.from('warriors').upsert({ uid: this.uid, state_json: this.state, updated_at: new Date() });
    }

    notify(msg) {
        this.els.toast.innerText = msg;
        this.els.toast.classList.add('active');
        setTimeout(() => this.els.toast.classList.remove('active'), 2500);
    }

    showXPPop(val) {
        const p = document.createElement('div');
        p.className = 'xp-pop-pro';
        p.innerText = `+${val} XP`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 800);
    }

    updateDate() {
        const opt = { weekday: 'long', day: 'numeric', month: 'long' };
        document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', opt).toUpperCase();
    }

    async renderLeaderboard() {
        const c = this.$('leaderboard-list'); if (!c) return;
        let warriors = [];
        try {
            const { data } = await sb.from('warriors').select('*');
            if (data) warriors = data.sort((a, b) => (b.state_json.xp || 0) - (a.state_json.xp || 0)).slice(0, 5);
        } catch (e) {}

        c.innerHTML = `<div class="leader-header"><span>GUERRERO</span><span>XP TOTAL</span></div>`;
        if (warriors.length === 0) { c.innerHTML += `<div class="leader-row current">👤 ${this.uid} (Tú) · ${this.state.xp} XP</div>`; return; }
        warriors.forEach((w) => {
            const isMe = w.uid === this.uid;
            c.innerHTML += `
                <div class="leader-row ${isMe ? 'current' : ''}">
                    <div style="display:flex; align-items:center; gap:12px">
                        <img src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${w.uid}" style="width:34px; border-radius:50%">
                        <span style="font-weight: 700;">${w.uid}</span>
                    </div>
                    <strong>${(w.state_json.xp || 0).toLocaleString()}</strong>
                </div>`;
        });
    }

    renderChart() {
        const c = this.$('chart-bars'); if (!c) return;
        c.innerHTML = '';
        this.state.metrics.forEach((v, i) => {
            const bar = document.createElement('div');
            bar.className = 'chart-bar-pro';
            bar.style.height = `${v}%`;
            c.appendChild(bar);
        });
    }

    syncRealtime() {
        sb.channel('public:warriors').on('postgres_changes', { event: '*', schema: 'public', table: 'warriors' }, () => this.renderLeaderboard()).subscribe();
    }
}

const app = new AndradeApp();

`;
document.head.appendChild(style);

const app = new AndradeApp();
