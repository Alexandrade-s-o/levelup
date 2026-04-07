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
            nav: document.querySelectorAll('.nav-item, .nav-item-m'),
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
                this.notify(`¡Bienvenido de nuevo!`);
            }
        };
    }

    async initSession() {
        console.log("🚀 Iniciando sesión para:", this.uid);

        // MOSTRAR APP DE INMEDIATO (UX fluida)
        this.els.app.classList.remove('hidden');
        this.els.auth.classList.add('hidden');

        // CARGA LOCAL INICIAL
        this.loadLocalState();
        this.setupHandlers();
        this.updateDate();
        this.renderAll();

        // INTENTO DE SINCRONIZACIÓN REMOTA (Segundo plano)
        try {
            await this.syncRemoteState();
            console.log("☁️ Supabase: Datos sincronizados.");
            this.renderAll(); // Re-renderizar con datos frescos de la nube
        } catch (e) {
            console.warn("⚠️ Supabase error (Offline mode):", e.message);
        }

        try { this.syncRealtime(); } catch (e) { }
    }

    loadLocalState() {
        const key = `and_data_${this.uid}`;
        const localRaw = JSON.parse(localStorage.getItem(key)) || {};
        this.state = {
            xp: 0, level: 1, streak: 0,
            habits: [], goals: [], metrics: [20, 45, 60, 30, 80, 50, 40],
            lastDate: new Date().toDateString(),
            ...localRaw
        };

        // Reset diario local
        if (this.state.lastDate !== new Date().toDateString()) {
            this.state.habits.forEach(h => h.done = false);
            this.state.lastDate = new Date().toDateString();
            this.save(true); // Guardar solo local por ahora
        }
    }

    async syncRemoteState() {
        if (!this.uid) return;

        const { data, error } = await sb
            .from('warriors')
            .select('*')
            .eq('uid', this.uid)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log("🆕 Nuevo guerrero en la red, creando registro...");
                await this.saveRemote();
            } else {
                throw error;
            }
        } else if (data) {
            // Unir datos remotos y locales (prioridad remota si hay discrepancia)
            this.state = { ...this.state, ...data.state_json };
            localStorage.setItem(`and_data_${this.uid}`, JSON.stringify(this.state));
        }
    }

    setupHandlers() {
        this.els.nav.forEach(el => el.onclick = (e) => {
            e.preventDefault();
            const v = el.id ? el.id.replace('nav-', '') : el.dataset.view;
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

        // Ring Progress
        const ringPct = (s.xp % 1000) / 10;
        this.els.progressTotal.setAttribute('stroke-dasharray', `${ringPct}, 100`);

        // Avatars
        const av = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${this.uid}&backgroundColor=00f2ff,3d5afe`;
        this.$('sidebar-avatar').src = av;
        this.$('topbar-avatar').src = av;
    }

    renderHabits() {
        const c = this.$('habits-dash-list');
        c.innerHTML = this.state.habits.length ? '' : '<p style="color:var(--text-muted); padding: 1rem; font-size: 0.9rem;">No tienes misiones para hoy.</p>';
        this.state.habits.forEach((h, i) => {
            const el = document.createElement('div');
            el.className = `habit-item ${h.done ? 'done' : ''}`;
            el.innerHTML = `
                <div class="habit-check"></div>
                <div style="flex:1">
                    <div class="habit-name" style="font-weight: 700; font-size: 0.95rem;">${h.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${h.det || 'Sin detalles'}</div>
                </div>
            `;
            el.onclick = () => this.toggleHabit(i);
            c.appendChild(el);
        });
    }

    renderGoals() {
        const c = this.$('goals-dash-list');
        c.innerHTML = this.state.goals.length ? '' : '<p style="color:var(--text-muted); font-size: 0.9rem;">No hay objetivos marcados.</p>';
        this.state.goals.forEach((g, i) => {
            const el = document.createElement('div');
            el.className = 'goal-card';
            el.style = 'background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 1.2rem; border-radius: 16px; transition: var(--transition);';
            const progress = Math.min((g.cur / g.target) * 100, 100);
            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:12px">
                    <span style="font-weight: 700; font-size: 0.9rem;">${g.name}</span>
                    <strong style="color: var(--accent); font-size: 0.85rem;">${g.cur}/${g.target}</strong>
                </div>
                <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden">
                    <div style="width:${progress}%; height:100%; background:linear-gradient(to right, var(--secondary), var(--accent)); transition: width 0.8s ease;"></div>
                </div>
                <div style="display:flex; gap:8px; margin-top:15px">
                    <button class="btn-primary" style="padding: 0.4rem; font-size: 0.8rem;" onclick="event.stopPropagation(); app.modGoal(${i}, 1)">+ Progreso</button>
                    <button class="btn-ghost" style="padding: 0.4rem 0.8rem; border-radius: 10px;" onclick="event.stopPropagation(); app.delGoal(${i})">✕</button>
                </div>`;
            c.appendChild(el);
        });
    }

    async toggleHabit(i) {
        const h = this.state.habits[i];
        h.done = !h.done;
        if (h.done) { this.awardXP(100); this.notify('+100 XP Misión Completada'); }
        else { this.awardXP(-100); this.notify('-100 XP'); }
        await this.save();
    }

    async modGoal(i, val) {
        const g = this.state.goals[i];
        g.cur = Math.min(g.cur + val, g.target);
        if (g.cur === g.target) { this.awardXP(500); this.notify('🏆 ¡OBJETIVO LOGRADO! +500 XP'); }
        else { this.awardXP(25); this.notify('+25 XP Progreso'); }
        await this.save();
    }

    async delGoal(i) { if (confirm('¿Eliminar objetivo?')) { this.state.goals.splice(i, 1); await this.save(); } }

    awardXP(val) {
        this.state.xp = Math.max(0, this.state.xp + val);
        const newLvl = Math.floor(this.state.xp / 1000) + 1;
        if (newLvl > this.state.level) {
            this.state.level = newLvl;
            this.notify(`🌟 ¡NIVEL ${newLvl} ALCANZADO!`);
        }
        if (val > 0) this.showXPPop(val);
    }

    openModal(type) {
        this.currModal = type;
        this.els.modal.classList.remove('hidden');
        this.$('modal-title').innerText = type === 'habit' ? 'Nueva Misión' : 'Nuevo Objetivo';
        this.$('modal-label-1').innerText = 'Nombre';
        this.$('modal-label-2').innerText = type === 'habit' ? 'Recompensa (Opcional)' : 'Meta (Cant. Numérica)';
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
        this.els.views.forEach(el => el.classList.toggle('hidden', el.id !== `view-${v}`));
        this.els.nav.forEach(el => {
            const active = el.id === `nav-${v}` || el.dataset.view === v;
            el.classList.toggle('active', active);
        });
        this.renderAll();
    }

    async save(onlyLocal = false) {
        localStorage.setItem(`and_data_${this.uid}`, JSON.stringify(this.state));
        this.renderAll();
        if (!onlyLocal) {
            try { await this.saveRemote(); } catch (e) { }
        }
    }

    async saveRemote() {
        const { error } = await sb.from('warriors').upsert({
            uid: this.uid,
            state_json: this.state,
            updated_at: new Date()
        });
        if (error) throw error;
    }

    notify(msg) {
        const t = this.els.toast;
        t.innerText = msg;
        t.style.transform = 'translate(-50%, -20px)';
        t.style.opacity = '1';
        t.style.background = 'rgba(0, 242, 255, 0.15)';
        t.style.backdropFilter = 'blur(10px)';
        t.style.border = '1px solid var(--accent)';
        t.style.padding = '12px 24px';
        t.style.borderRadius = '50px';
        t.style.position = 'fixed';
        t.style.bottom = '40px';
        t.style.left = '50%';
        t.style.zIndex = '2000';
        t.style.transition = 'all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';

        setTimeout(() => {
            t.style.transform = 'translate(-50%, 100px)';
            t.style.opacity = '0';
        }, 2500);
    }

    showXPPop(val) {
        const p = document.createElement('div');
        p.style = `position:fixed; top:45%; left:50%; color:var(--accent); font-weight:900; font-size:3.5rem; text-shadow:0 0 40px var(--accent); pointer-events:none; z-index:10000; animation: xpPopUp 0.8s ease-out forwards; font-family: var(--font-heading);`;
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
            if (data) {
                // Ordenar localmente para evitar problemas de tipos en PostgREST rápido
                warriors = data.sort((a, b) => (b.state_json.xp || 0) - (a.state_json.xp || 0)).slice(0, 5);
            }
        } catch (e) { }

        c.innerHTML = `<div style="padding:1.2rem; display:flex; justify-content:space-between; border-bottom:1px solid var(--border); color: var(--text-muted); font-size: 0.8rem; font-weight: 700; text-transform: uppercase;">
                <span>Guerrero</span> <span>XP Total</span>
            </div>`;

        if (warriors.length === 0) {
            c.innerHTML += `<div style="padding:1.2rem; opacity:0.5">👤 ${this.uid} (Tú) · ${this.state.xp} XP</div>`;
            return;
        }

        warriors.forEach((w, i) => {
            const isMe = w.uid === this.uid;
            c.innerHTML += `
                <div style="padding:1.2rem; display:flex; justify-content:space-between; align-items:center; ${isMe ? 'background:var(--accent-glow); border:1px solid var(--accent);' : 'opacity:0.8;'} border-radius:16px; margin-top:10px;">
                    <div style="display:flex; align-items:center; gap:12px">
                        <img src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${w.uid}" style="width:32px; border-radius:50%">
                        <span style="font-weight: 800;">${w.uid} ${isMe ? '(Tú)' : ''}</span>
                    </div>
                    <strong>${(w.state_json.xp || 0).toLocaleString()} XP</strong>
                </div>`;
        });
    }

    renderChart() {
        const c = this.$('chart-bars'); if (!c) return;
        c.innerHTML = '';
        this.state.metrics.forEach((v, i) => {
            const bar = document.createElement('div');
            bar.style = `flex:1; background:linear-gradient(to top, var(--secondary), var(--accent)); height:${v}%; border-radius:6px 6px 0 0; opacity:${0.3 + (i * 0.1)}; transition: height 1s ease;`;
            c.appendChild(bar);
        });
    }

    syncRealtime() {
        sb.channel('public:warriors')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'warriors' }, () => {
                this.renderLeaderboard();
            })
            .subscribe();
    }
}

// Global scope animation for XP POP
const style = document.createElement('style');
style.textContent = `
@keyframes xpPopUp {
    0% { opacity: 0; transform: translate(-50%, 0) scale(0.5); }
    30% { opacity: 1; transform: translate(-50%, -100px) scale(1.2); }
    100% { opacity: 0; transform: translate(-50%, -200px) scale(1); }
}
`;
document.head.appendChild(style);

const app = new AndradeApp();
