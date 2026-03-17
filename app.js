
        // ============================================
        // NOVA X EDU - MAIN APPLICATION LOGIC
        // ============================================

        // Supabase Configuration
        const SUPABASE_URL = 'https://vxrxncjixwqqaasmkpvw.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4cnhuY2ppeHdxcWFhc21rcHZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTI3MzMsImV4cCI6MjA4OTE2ODczM30.QESIHemwVvSierW1k_H_np9w60kPs4rMku5n2vzQeG0';

        // Initialize Supabase Client
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Global State
        let currentUser = null;
        let userProfile = null;
        let currentPage = 'dashboard';
        let cart = [];
        let checkoutStep = 1;
        let checkoutData = {};

        // ============================================
        // INITIALIZATION
        // ============================================

        document.addEventListener('DOMContentLoaded', async () => {
            initTheme();
            
            // Check if on app page
            if (document.getElementById('app-container')) {
                await checkAuth();
            }
        });

        // Theme Management
        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }

        function toggleTheme() {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        }

        // ============================================
        // AUTHENTICATION
        // ============================================

        async function checkAuth() {
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session) {
                window.location.href = 'auth.html';
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            currentUser = user;

            // Fetch profile
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
                showToast('Error loading profile', 'error');
                return;
            }

            userProfile = profile;

            // Check if blocked
            if (profile.is_blocked) {
                await supabase.auth.signOut();
                showToast(profile.block_reason || 'Account suspended', 'error');
                setTimeout(() => window.location.href = 'auth.html', 2000);
                return;
            }

            // Initialize UI
            initializeApp();
        }

        function initializeApp() {
            // Hide loading, show app
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');

            // Update user info in UI
            updateUserUI();

            // Setup menus based on role
            setupMenus();

            // Load default page
            loadPage(getDefaultPage());

            // Load cart
            loadCart();

            // Subscribe to notifications
            subscribeToNotifications();
        }

        function updateUserUI() {
            const initials = `${userProfile.first_name?.[0] || 'U'}${userProfile.last_name?.[0] || ''}`;
            const fullName = `${userProfile.first_name || 'User'} ${userProfile.last_name || ''}`;

            document.querySelectorAll('#user-avatar, #user-avatar-mini').forEach(el => {
                el.textContent = initials;
            });
            document.querySelectorAll('#user-name, #user-name-mini').forEach(el => {
                el.textContent = fullName;
            });
            document.getElementById('user-email').textContent = currentUser.email;
            document.getElementById('user-role-mini').textContent = capitalizeFirst(userProfile.role);
        }

        function setupMenus() {
            const role = userProfile.role;
            
            // Hide all role-specific menus first
            document.getElementById('menu-student').classList.add('hidden');
            document.getElementById('menu-teacher').classList.add('hidden');
            document.getElementById('menu-admin').classList.add('hidden');
            document.getElementById('cart-btn').classList.add('hidden');

            // Show appropriate menu
            if (role === 'student') {
                document.getElementById('menu-student').classList.remove('hidden');
                document.getElementById('cart-btn').classList.remove('hidden');
            } else if (role === 'teacher') {
                document.getElementById('menu-teacher').classList.remove('hidden');
                document.getElementById('menu-student').classList.remove('hidden'); // Teachers can see student view too
            } else if (role === 'admin') {
                document.getElementById('menu-admin').classList.remove('hidden');
                document.getElementById('menu-teacher').classList.remove('hidden');
                document.getElementById('menu-student').classList.remove('hidden');
            }
        }

        function getDefaultPage() {
            const role = userProfile.role;
            if (role === 'admin') return 'a-dashboard';
            if (role === 'teacher') return 't-dashboard';
            return 'dashboard';
        }

        async function logout() {
            // Log activity
            const ip = await getIPAddress();
            const fingerprint = await generateDeviceFingerprint();
            
            await supabase.from('activity_logs').insert({
                user_id: currentUser.id,
                action: 'logout',
                ip_address: ip,
                device_fingerprint: fingerprint
            });

            // Update session logout time
            await supabase
                .from('sessions')
                .update({ logout_at: new Date().toISOString() })
                .eq('user_id', currentUser.id)
                .is('logout_at', null);

            await supabase.auth.signOut();
            window.location.href = 'auth.html';
        }

        // ============================================
        // NAVIGATION & PAGE LOADING
        // ============================================

        function loadPage(page) {
            currentPage = page;
            const content = document.getElementById('main-content');

            // Update active sidebar link
            document.querySelectorAll('.sidebar-link').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('onclick')?.includes(`'${page}'`)) {
                    link.classList.add('active');
                }
            });

            // Show loading
            content.innerHTML = `<div class="flex items-center justify-center h-64"><div class="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div></div>`;

            // Route to page renderer
            const renderers = {
                'dashboard': renderStudentDashboard,
                'timetable': renderTimetable,
                'recordings': renderRecordings,
                'notes': renderNotes,
                'quizzes': renderQuizzes,
                'store': renderStore,
                'my-orders': renderMyOrders,
                'payments': renderPayments,
                'activity': renderActivityLog,
                'profile': renderProfile,
                
                't-dashboard': renderTeacherDashboard,
                't-approvals': renderApprovals,
                't-students': renderTeacherStudents,
                't-content': renderContentManager,
                't-payments': renderTeacherPayments,
                't-orders': renderTeacherOrders,
                
                'a-dashboard': renderAdminDashboard,
                'a-subjects': renderAdminSubjects,
                'a-teachers': renderAdminTeachers,
                'a-students': renderAdminStudents,
                'a-security': renderAdminSecurity,
                'a-settings': renderAdminSettings
            };

            const renderer = renderers[page];
            if (renderer) {
                renderer();
            } else {
                content.innerHTML = `<div class="text-center py-20"><h2 class="text-2xl font-bold mb-2">Page Not Found</h2><p class="text-slate-500">The requested page does not exist.</p></div>`;
            }

            // Close sidebar on mobile
            closeSidebar();
        }

        // ============================================
        // STUDENT PORTAL PAGES
        // ============================================

        async function renderStudentDashboard() {
            const content = document.getElementById('main-content');
            
            // Fetch stats
            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('*, batches(name, subjects(name))')
                .eq('student_id', currentUser.id);

            const approvedCount = enrollments?.filter(e => e.status === 'approved').length || 0;
            const pendingCount = enrollments?.filter(e => e.status === 'pending').length || 0;

            content.innerHTML = `
                <div class="animate-fade-in-up">
                    <h1 class="font-display text-2xl font-bold mb-6">Welcome back, ${userProfile.first_name}!</h1>
                    
                    <!-- Stats Grid -->
                    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                                    <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-500">Enrolled</p>
                                    <p class="text-2xl font-bold">${approvedCount}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                    <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                </div>
                                <div>
                                    <p class="text-sm text-slate-500">Pending</p>
                                    <p class="text-2xl font-bold">${pendingCount}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Enrollments -->
                    <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div class="p-4 border-b border-slate-200 dark:border-slate-800">
                            <h2 class="font-semibold">My Enrollments</h2>
                        </div>
                        <div class="divide-y divide-slate-200 dark:divide-slate-800">
                            ${enrollments && enrollments.length > 0 ? enrollments.map(e => `
                                <div class="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <div>
                                        <p class="font-medium">${e.batches?.name || 'Unknown Batch'}</p>
                                        <p class="text-sm text-slate-500">${e.batches?.subjects?.name || ''}</p>
                                    </div>
                                    <span class="badge ${e.status === 'approved' ? 'badge-success' : e.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">${capitalizeFirst(e.status)}</span>
                                </div>
                            `).join('') : '<p class="p-4 text-center text-slate-500">No enrollments yet</p>'}
                        </div>
                    </div>
                </div>
            `;
        }

        async function renderTimetable() {
            const content = document.getElementById('main-content');
            content.innerHTML = `<h1 class="font-display text-2xl font-bold mb-6">Class Timetable</h1><div id="timetable-content" class="grid gap-4"></div>`;

            // Note: Complex relationship queries might need adjustment based on exact RLS policies
            const { data: timetable } = await supabase
                .from('timetable')
                .select('*, batches(name)')
                .order('class_date', { ascending: true })
                .limit(50);

            const container = document.getElementById('timetable-content');
            
            if (!timetable || timetable.length === 0) {
                container.innerHTML = `<div class="col-span-full text-center py-12 bg-white dark:bg-slate-900 rounded-xl"><p class="text-slate-500">No scheduled classes found.</p></div>`;
                return;
            }

            container.innerHTML = timetable.map(item => `
                <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 card-hover">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <span class="text-xs text-amber-600 font-medium">${item.batches?.name || 'Batch'}</span>
                            <h3 class="font-semibold text-lg mt-1">${item.title}</h3>
                            <p class="text-sm text-slate-500 mt-1">${item.description || ''}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-mono text-lg">${formatDate(item.class_date)}</p>
                            <p class="text-sm text-slate-500">${item.start_time?.substring(0, 5)} - ${item.end_time?.substring(0, 5)}</p>
                        </div>
                    </div>
                    ${item.zoom_link ? `<a href="${item.zoom_link}" target="_blank" class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Join Class</a>` : ''}
                </div>
            `).join('');
        }

        async function renderRecordings() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <h1 class="font-display text-2xl font-bold mb-6">Class Recordings</h1>
                <div class="mb-6 flex flex-wrap gap-4">
                    <select id="rec-year" class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" onchange="filterRecordings()">
                        <option value="">All Years</option>
                        ${generateYearOptions()}
                    </select>
                    <select id="rec-type" class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" onchange="filterRecordings()">
                        <option value="">All Types</option>
                        <option value="theory">Theory</option>
                        <option value="paper">Paper</option>
                        <option value="revision">Revision</option>
                        <option value="extra">Extra</option>
                    </select>
                </div>
                <div id="recordings-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
            `;

            window.filterRecordings = async function() {
                const year = document.getElementById('rec-year').value;
                const type = document.getElementById('rec-type').value;
                
                let query = supabase
                    .from('recordings')
                    .select('*')
                    .eq('is_active', true)
                    .order('class_date', { ascending: false });

                if (year) query = query.eq('year', year);
                if (type) query = query.eq('recording_type', type);

                const { data } = await query.limit(50);
                renderRecordingsGrid(data);
            };

            filterRecordings();
        }

        function renderRecordingsGrid(recordings) {
            const grid = document.getElementById('recordings-grid');
            if (!recordings || recordings.length === 0) {
                grid.innerHTML = `<div class="col-span-full text-center py-12 bg-white dark:bg-slate-900 rounded-xl"><p class="text-slate-500">No recordings found.</p></div>`;
                return;
            }

            grid.innerHTML = recordings.map(rec => `
                <div class="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 card-hover">
                    <div class="aspect-video relative bg-slate-100 dark:bg-slate-800">
                        ${rec.thumbnail_url 
                            ? `<img src="${rec.thumbnail_url}" class="w-full h-full object-cover">`
                            : `<div class="absolute inset-0 flex items-center justify-center"><svg class="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></div>`
                        }
                        ${rec.is_free ? '<span class="absolute top-2 right-2 badge badge-success">Free</span>' : '<span class="absolute top-2 right-2 badge badge-info">Paid</span>'}
                        ${rec.duration_minutes ? `<span class="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">${rec.duration_minutes} min</span>` : ''}
                    </div>
                    <div class="p-4">
                        <h3 class="font-semibold line-clamp-2">${rec.title}</h3>
                        <p class="text-sm text-slate-500 mt-1 line-clamp-2">${rec.description || ''}</p>
                        <div class="flex items-center justify-between mt-3 text-xs text-slate-400">
                            <span>${capitalizeFirst(rec.recording_type)}</span>
                            <span>${rec.class_date ? formatDate(rec.class_date) : ''}</span>
                        </div>
                        <a href="${rec.video_url}" target="_blank" class="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Watch
                        </a>
                    </div>
                </div>
            `).join('');
        }

        async function renderNotes() {
            const content = document.getElementById('main-content');
            content.innerHTML = `<h1 class="font-display text-2xl font-bold mb-6">Study Notes</h1><div id="notes-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;

            const { data: notes } = await supabase
                .from('notes')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(50);

            const grid = document.getElementById('notes-grid');
            if (!notes || notes.length === 0) {
                grid.innerHTML = `<div class="col-span-full text-center py-12 bg-white dark:bg-slate-900 rounded-xl"><p class="text-slate-500">No notes available.</p></div>`;
                return;
            }

            grid.innerHTML = notes.map(note => `
                <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 card-hover">
                    <div class="flex items-start justify-between">
                        <div class="w-12 h-12 rounded-xl ${note.file_type === 'pdf' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'} flex items-center justify-center">
                            <svg class="w-6 h-6 ${note.file_type === 'pdf' ? 'text-red-600' : 'text-blue-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg>
                        </div>
                        ${note.is_free ? '<span class="badge badge-success">Free</span>' : '<span class="badge badge-info">Paid</span>'}
                    </div>
                    <h3 class="font-semibold mt-4">${note.title}</h3>
                    <p class="text-sm text-slate-500 mt-1 line-clamp-2">${note.description || ''}</p>
                    <div class="flex items-center justify-between mt-4 text-xs text-slate-400">
                        <span>${note.file_type?.toUpperCase()}</span>
                        <span>${note.file_size_kb ? `${note.file_size_kb} KB` : ''}</span>
                    </div>
                    <a href="${note.file_url}" target="_blank" class="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        Download
                    </a>
                </div>
            `).join('');
        }

        async function renderQuizzes() {
            const content = document.getElementById('main-content');
            content.innerHTML = `<h1 class="font-display text-2xl font-bold mb-6">Quizzes</h1><div id="quizzes-grid" class="grid sm:grid-cols-2 gap-4"></div>`;

            const { data: quizzes } = await supabase
                .from('quizzes')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(50);

            const grid = document.getElementById('quizzes-grid');
            if (!quizzes || quizzes.length === 0) {
                grid.innerHTML = `<div class="col-span-full text-center py-12 bg-white dark:bg-slate-900 rounded-xl"><p class="text-slate-500">No quizzes available.</p></div>`;
                return;
            }

            grid.innerHTML = quizzes.map(quiz => `
                <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 card-hover">
                    <div class="flex items-start justify-between">
                        <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                        </div>
                        ${quiz.is_free ? '<span class="badge badge-success">Free</span>' : '<span class="badge badge-info">Paid</span>'}
                    </div>
                    <h3 class="font-semibold mt-4">${quiz.title}</h3>
                    <p class="text-sm text-slate-500 mt-1">${quiz.description || ''}</p>
                    <div class="flex items-center gap-4 mt-4 text-sm text-slate-400">
                        <span>${quiz.duration_minutes} mins</span>
                        <span>${quiz.total_marks} marks</span>
                        <span>Pass: ${quiz.pass_mark}%</span>
                    </div>
                    <button onclick="startQuiz('${quiz.id}')" class="mt-4 w-full py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg font-medium hover:shadow-lg transition-all">
                        Start Quiz
                    </button>
                </div>
            `).join('');
        }

        async function renderStore() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <div class="flex items-center justify-between mb-6">
                    <h1 class="font-display text-2xl font-bold">Store</h1>
                    <div class="relative">
                        <input type="text" id="store-search" placeholder="Search products..." class="pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" oninput="searchProducts(this.value)">
                        <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </div>
                </div>
                <div id="products-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>
                <div id="products-pagination" class="flex justify-center gap-2 mt-8"></div>
            `;

            window.searchProducts = debounce(async (term) => {
                loadProducts(1, term);
            }, 300);

            loadProducts(1);
        }

        async function loadProducts(page = 1, search = '') {
            const grid = document.getElementById('products-grid');
            const pagination = document.getElementById('products-pagination');
            grid.innerHTML = '<div class="col-span-full text-center py-12"><div class="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto"></div></div>';

            const perPage = 12;
            const from = (page - 1) * perPage;
            const to = from + perPage - 1;

            let query = supabase
                .from('products')
                .select('*', { count: 'exact' })
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (search) query = query.ilike('title', `%${search}%`);

            const { data, count, error } = await query.range(from, to);

            if (error || !data) {
                grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">Failed to load products.</div>';
                return;
            }

            if (data.length === 0) {
                grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">No products found.</div>';
                pagination.innerHTML = '';
                return;
            }

            grid.innerHTML = data.map(product => `
                <div class="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 card-hover">
                    <div class="aspect-square relative bg-slate-100 dark:bg-slate-800">
                        ${product.image_url 
                            ? `<img src="${product.image_url}" class="w-full h-full object-cover">`
                            : `<div class="absolute inset-0 flex items-center justify-center"><svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg></div>`
                        }
                    </div>
                    <div class="p-4">
                        <h3 class="font-semibold line-clamp-2">${product.title}</h3>
                        <p class="text-sm text-slate-500 mt-1 line-clamp-2">${product.description || ''}</p>
                        <div class="flex items-center justify-between mt-4">
                            <span class="font-bold text-lg text-amber-600">Rs. ${Number(product.price).toLocaleString()}</span>
                            <button onclick="addToCart('${product.id}')" class="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition-colors">
                                Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');

            // Pagination
            const totalPages = Math.ceil(count / perPage);
            if (totalPages > 1) {
                pagination.innerHTML = renderPagination(page, totalPages, 'loadProducts');
            } else {
                pagination.innerHTML = '';
            }
        }

        // Cart Functions
        function loadCart() {
            const saved = localStorage.getItem('cart');
            cart = saved ? JSON.parse(saved) : [];
            updateCartUI();
        }

        function saveCart() {
            localStorage.setItem('cart', JSON.stringify(cart));
            updateCartUI();
        }

        function updateCartUI() {
            const count = cart.reduce((sum, item) => sum + item.quantity, 0);
            const countEl = document.getElementById('cart-count');
            if (count > 0) {
                countEl.textContent = count;
                countEl.classList.remove('hidden');
            } else {
                countEl.classList.add('hidden');
            }
        }

        async function addToCart(productId) {
            const { data: product } = await supabase
                .from('products')
                .select('*')
                .eq('id', productId)
                .single();

            if (!product) {
                showToast('Product not found', 'error');
                return;
            }

            const existing = cart.find(item => item.id === productId);
            if (existing) {
                existing.quantity++;
            } else {
                cart.push({
                    id: product.id,
                    title: product.title,
                    price: product.price,
                    image_url: product.image_url,
                    quantity: 1
                });
            }

            saveCart();
            showToast('Added to cart', 'success');
            openCart();
        }

        function removeFromCart(productId) {
            cart = cart.filter(item => item.id !== productId);
            saveCart();
            renderCartItems();
        }

        function updateCartQuantity(productId, delta) {
            const item = cart.find(i => i.id === productId);
            if (item) {
                item.quantity += delta;
                if (item.quantity <= 0) {
                    removeFromCart(productId);
                } else {
                    saveCart();
                    renderCartItems();
                }
            }
        }

        function openCart() {
            document.getElementById('cart-overlay').classList.remove('hidden');
            document.getElementById('cart-panel').classList.remove('translate-x-full');
            renderCartItems();
        }

        function closeCart() {
            document.getElementById('cart-overlay').classList.add('hidden');
            document.getElementById('cart-panel').classList.add('translate-x-full');
        }

        function renderCartItems() {
            const container = document.getElementById('cart-items');
            const subtotalEl = document.getElementById('cart-subtotal');
            
            if (cart.length === 0) {
                container.innerHTML = `<div class="text-center py-12"><svg class="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg><p class="text-slate-500">Your cart is empty</p></div>`;
                subtotalEl.textContent = 'Rs. 0.00';
                return;
            }

            container.innerHTML = cart.map(item => `
                <div class="flex gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl mb-3">
                    <div class="w-16 h-16 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0">
                        ${item.image_url ? `<img src="${item.image_url}" class="w-full h-full object-cover">` : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-medium text-sm truncate">${item.title}</h4>
                        <p class="text-amber-600 font-medium">Rs. ${Number(item.price).toLocaleString()}</p>
                        <div class="flex items-center gap-2 mt-2">
                            <button onclick="updateCartQuantity('${item.id}', -1)" class="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600">-</button>
                            <span class="text-sm font-medium">${item.quantity}</span>
                            <button onclick="updateCartQuantity('${item.id}', 1)" class="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600">+</button>
                        </div>
                    </div>
                    <button onclick="removeFromCart('${item.id}')" class="text-slate-400 hover:text-red-500">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `).join('');

            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            subtotalEl.textContent = `Rs. ${subtotal.toLocaleString()}`;
        }

        function proceedToCheckout() {
            if (cart.length === 0) {
                showToast('Your cart is empty', 'error');
                return;
            }
            closeCart();
            openCheckoutModal();
        }

        // Checkout Flow
        function openCheckoutModal() {
            checkoutStep = 1;
            checkoutData = {
                items: [...cart],
                shipping: {
                    name: `${userProfile.first_name} ${userProfile.last_name}`,
                    address: userProfile.address,
                    phone: userProfile.whatsapp,
                    district: userProfile.district
                },
                paymentMethod: null,
                agreeRules: false
            };
            
            document.getElementById('checkout-modal').classList.add('active');
            renderCheckoutStep();
        }

        function closeCheckoutModal() {
            document.getElementById('checkout-modal').classList.remove('active');
        }

        function renderCheckoutStep() {
            const body = document.getElementById('checkout-body');
            const title = document.getElementById('checkout-title');
            const backBtn = document.getElementById('checkout-back');
            const steps = document.querySelectorAll('.checkout-step');
            const progress = document.querySelectorAll('.checkout-progress');
            
            // Update progress indicators
            steps.forEach((step, i) => {
                const stepNum = i + 1;
                step.classList.toggle('active', stepNum <= checkoutStep);
                step.classList.toggle('bg-amber-500', stepNum <= checkoutStep);
                step.classList.toggle('text-white', stepNum <= checkoutStep);
                step.classList.toggle('bg-slate-200', stepNum > checkoutStep);
                step.classList.toggle('dark:bg-slate-700', stepNum > checkoutStep);
            });
            
            progress.forEach((bar, i) => {
                const progNum = i + 1;
                bar.style.width = checkoutStep > progNum ? '100%' : '0%';
            });
            
            backBtn.classList.toggle('hidden', checkoutStep === 1);

            switch(checkoutStep) {
                case 1:
                    title.textContent = 'Cart Review';
                    renderCheckoutCart(body);
                    break;
                case 2:
                    title.textContent = 'Shipping Details';
                    renderCheckoutShipping(body);
                    break;
                case 3:
                    title.textContent = 'Payment Method';
                    renderCheckoutPayment(body);
                    break;
                case 4:
                    title.textContent = 'Order Summary';
                    renderCheckoutSummary(body);
                    break;
            }
        }

        function renderCheckoutCart(body) {
            const subtotal = checkoutData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            body.innerHTML = `
                <div class="space-y-4 max-h-64 overflow-y-auto mb-6">
                    ${checkoutData.items.map(item => `
                        <div class="flex gap-4">
                            <div class="w-12 h-12 rounded bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden">
                                ${item.image_url ? `<img src="${item.image_url}" class="w-full h-full object-cover">` : ''}
                            </div>
                            <div class="flex-1">
                                <p class="font-medium text-sm">${item.title}</p>
                                <p class="text-sm text-slate-500">Qty: ${item.quantity}</p>
                            </div>
                            <p class="font-medium">Rs. ${(item.price * item.quantity).toLocaleString()}</p>
                        </div>
                    `).join('')}
                </div>
                <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <div class="flex justify-between text-lg font-bold">
                        <span>Subtotal</span>
                        <span>Rs. ${subtotal.toLocaleString()}</span>
                    </div>
                </div>
                <button onclick="nextCheckoutStep()" class="w-full mt-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium">
                    Continue to Shipping
                </button>
            `;
        }

        function renderCheckoutShipping(body) {
            body.innerHTML = `
                <div class="space-y-4">
                    <div class="flex items-center justify-between">
                        <label class="block text-sm font-medium">Full Name</label>
                        <button onclick="enableShippingEdit('name')" class="text-amber-600 text-sm hover:underline">Edit</button>
                    </div>
                    <input type="text" id="ship-name" value="${checkoutData.shipping.name}" readonly class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    
                    <div class="flex items-center justify-between">
                        <label class="block text-sm font-medium">Address</label>
                        <button onclick="enableShippingEdit('address')" class="text-amber-600 text-sm hover:underline">Edit</button>
                    </div>
                    <textarea id="ship-address" readonly class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl resize-none" rows="2">${checkoutData.shipping.address || ''}</textarea>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Phone</label>
                            <input type="tel" id="ship-phone" value="${checkoutData.shipping.phone || ''}" class="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">District</label>
                            <input type="text" id="ship-district" value="${checkoutData.shipping.district || ''}" class="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-6">
                    <button onclick="prevCheckoutStep()" class="flex-1 py-3 border border-slate-300 dark:border-slate-600 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                        Back
                    </button>
                    <button onclick="saveShippingAndNext()" class="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium">
                        Continue to Payment
                    </button>
                </div>
            `;
        }

        function renderCheckoutPayment(body) {
            const methods = [
                { id: 'bank_transfer', name: 'Bank Transfer', icon: '🏦' },
                { id: 'card', name: 'Card Payment', icon: '💳' },
                { id: 'institute', name: 'Pay to Institute', icon: '🏫' },
                { id: 'cod', name: 'Cash on Delivery', icon: '📦' },
                { id: 'ezcash', name: 'ezCash', icon: '📱' },
                { id: 'binance', name: 'Binance', icon: '₿' },
                { id: 'paypal', name: 'PayPal', icon: '🅿️' },
                { id: 'stripe', name: 'Stripe', icon: '💳' }
            ];

            body.innerHTML = `
                <p class="text-sm text-slate-500 mb-4">Select your preferred payment method</p>
                <div class="grid grid-cols-2 gap-3">
                    ${methods.map(m => `
                        <button onclick="selectPayment('${m.id}')" id="payment-${m.id}" class="p-4 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-left hover:border-amber-500 transition-colors ${checkoutData.paymentMethod === m.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : ''}">
                            <span class="text-2xl mb-2 block">${m.icon}</span>
                            <span class="font-medium text-sm">${m.name}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="flex gap-4 mt-6">
                    <button onclick="prevCheckoutStep()" class="flex-1 py-3 border border-slate-300 dark:border-slate-600 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                        Back
                    </button>
                    <button onclick="nextCheckoutStep()" class="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium" ${!checkoutData.paymentMethod ? 'disabled' : ''}>
                        Continue to Summary
                    </button>
                </div>
            `;
        }

        function renderCheckoutSummary(body) {
            const subtotal = checkoutData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const shipping = 0; // Free shipping
            const total = subtotal + shipping;

            body.innerHTML = `
                <div class="space-y-6">
                    <!-- Items -->
                    <div>
                        <h4 class="font-semibold mb-3">Order Items</h4>
                        <div class="space-y-2">
                            ${checkoutData.items.map(item => `
                                <div class="flex justify-between text-sm">
                                    <span>${item.title} x ${item.quantity}</span>
                                    <span>Rs. ${(item.price * item.quantity).toLocaleString()}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Shipping -->
                    <div>
                        <h4 class="font-semibold mb-3">Shipping Address</h4>
                        <p class="text-sm text-slate-500">${checkoutData.shipping.name}<br>${checkoutData.shipping.address}<br>${checkoutData.shipping.district}<br>Phone: ${checkoutData.shipping.phone}</p>
                    </div>
                    
                    <!-- Payment -->
                    <div>
                        <h4 class="font-semibold mb-3">Payment Method</h4>
                        <p class="text-sm text-slate-500">${capitalizeFirst(checkoutData.paymentMethod?.replace('_', ' '))}</p>
                    </div>
                    
                    <!-- Totals -->
                    <div class="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
                        <div class="flex justify-between text-sm">
                            <span>Subtotal</span>
                            <span>Rs. ${subtotal.toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span>Shipping</span>
                            <span>${shipping === 0 ? 'Free' : `Rs. ${shipping}`}</span>
                        </div>
                        <div class="flex justify-between text-lg font-bold pt-2 border-t border-slate-200 dark:border-slate-700">
                            <span>Total</span>
                            <span>Rs. ${total.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <!-- Terms -->
                    <label class="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" id="agree-rules" ${checkoutData.agreeRules ? 'checked' : ''} onchange="checkoutData.agreeRules = this.checked" class="w-4 h-4 mt-1 rounded border-slate-300 text-amber-500 focus:ring-amber-500">
                        <span class="text-sm text-slate-600 dark:text-slate-400">I agree to the <a href="index.html#rules" target="_blank" class="text-amber-600 hover:underline">Terms and Conditions</a></span>
                    </label>
                </div>
                
                <div class="flex gap-4 mt-6">
                    <button onclick="prevCheckoutStep()" class="flex-1 py-3 border border-slate-300 dark:border-slate-600 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                        Back
                    </button>
                    <button onclick="placeOrder()" class="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium" id="place-order-btn">
                        Place Order
                    </button>
                </div>
            `;
        }

        function nextCheckoutStep() {
            checkoutStep++;
            renderCheckoutStep();
        }

        function prevCheckoutStep() {
            if (checkoutStep > 1) {
                checkoutStep--;
                renderCheckoutStep();
            }
        }

        function selectPayment(method) {
            checkoutData.paymentMethod = method;
            document.querySelectorAll('[id^="payment-"]').forEach(el => {
                el.classList.remove('border-amber-500', 'bg-amber-50', 'dark:bg-amber-900/20');
                el.classList.add('border-slate-200', 'dark:border-slate-700');
            });
            const selected = document.getElementById(`payment-${method}`);
            selected.classList.add('border-amber-500', 'bg-amber-50', 'dark:bg-amber-900/20');
            selected.classList.remove('border-slate-200', 'dark:border-slate-700');
        }

        function saveShippingAndNext() {
            checkoutData.shipping = {
                name: document.getElementById('ship-name').value,
                address: document.getElementById('ship-address').value,
                phone: document.getElementById('ship-phone').value,
                district: document.getElementById('ship-district').value
            };
            nextCheckoutStep();
        }

        async function placeOrder() {
            if (!checkoutData.agreeRules) {
                showToast('Please agree to the terms and conditions', 'error');
                return;
            }

            const btn = document.getElementById('place-order-btn');
            btn.disabled = true;
            btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> Processing...';

            const subtotal = checkoutData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const orderNumber = `NXE-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

            try {
                // Create order
                const { data: order, error: orderError } = await supabase
                    .from('orders')
                    .insert({
                        user_id: currentUser.id,
                        order_number: orderNumber,
                        status: 'pending',
                        subtotal: subtotal,
                        shipping_fee: 0,
                        total: subtotal,
                        shipping_name: checkoutData.shipping.name,
                        shipping_address: checkoutData.shipping.address,
                        shipping_phone: checkoutData.shipping.phone,
                        shipping_district: checkoutData.shipping.district,
                        payment_method: checkoutData.paymentMethod
                    })
                    .select()
                    .single();

                if (orderError) throw orderError;

                // Create order items
                const orderItems = checkoutData.items.map(item => ({
                    order_id: order.id,
                    product_id: item.id,
                    title: item.title,
                    price: item.price,
                    quantity: item.quantity,
                    subtotal: item.price * item.quantity
                }));

                const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
                if (itemsError) throw itemsError;

                // Clear cart
                cart = [];
                saveCart();

                closeCheckoutModal();
                showToast('Order placed successfully!', 'success');
                loadPage('my-orders');
            } catch (error) {
                console.error('Order error:', error);
                showToast('Failed to place order. Please try again.', 'error');
                btn.disabled = false;
                btn.textContent = 'Place Order';
            }
        }

        async function renderMyOrders() {
            const content = document.getElementById('main-content');
            content.innerHTML = `<h1 class="font-display text-2xl font-bold mb-6">My Orders</h1><div id="orders-list" class="space-y-4"></div>`;

            const { data: orders } = await supabase
                .from('orders')
                .select('*, order_items(*)')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            const container = document.getElementById('orders-list');
            
            if (!orders || orders.length === 0) {
                container.innerHTML = `<div class="text-center py-12 bg-white dark:bg-slate-900 rounded-xl"><p class="text-slate-500">No orders yet.</p></div>`;
                return;
            }

            container.innerHTML = orders.map(order => `
                <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <p class="font-mono text-sm text-slate-500">${order.order_number}</p>
                            <p class="text-sm text-slate-400">${formatDateTime(order.created_at)}</p>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="badge ${getStatusBadgeClass(order.status)}">${capitalizeFirst(order.status)}</span>
                            <span class="font-bold">Rs. ${order.total.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="p-4">
                        ${order.order_items.map(item => `
                            <div class="flex justify-between text-sm py-1">
                                <span>${item.title} x ${item.quantity}</span>
                                <span>Rs. ${item.subtotal.toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                    ${order.status === 'shipped' ? `
                        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-t border-slate-200 dark:border-slate-700">
                            <button onclick="markAsReceived('${order.id}')" class="w-full py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
                                Mark as Received
                            </button>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }

        async function markAsReceived(orderId) {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'delivered', updated_at: new Date().toISOString() })
                .eq('id', orderId);

            if (error) {
                showToast('Failed to update order', 'error');
            } else {
                showToast('Order marked as received', 'success');
                renderMyOrders();
            }
        }

        async function renderPayments() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <h1 class="font-display text-2xl font-bold mb-6">Payments</h1>
                <div class="grid lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-2">
                        <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div class="p-4 border-b border-slate-200 dark:border-slate-800">
                                <h2 class="font-semibold">Payment History</h2>
                            </div>
                            <div id="payments-list" class="divide-y divide-slate-200 dark:divide-slate-800"></div>
                        </div>
                    </div>
                    <div>
                        <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                            <h2 class="font-semibold mb-4">Bank Details</h2>
                            <div id="bank-details"></div>
                        </div>
                    </div>
                </div>
            `;

            const { data: payments } = await supabase
                .from('payment_records')
                .select('*, batches(name)')
                .eq('student_id', currentUser.id)
                .order('payment_date', { ascending: false });

            const paymentsList = document.getElementById('payments-list');
            if (!payments || payments.length === 0) {
                paymentsList.innerHTML = '<p class="p-4 text-center text-slate-500">No payment records</p>';
            } else {
                paymentsList.innerHTML = payments.map(p => `
                    <div class="p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-medium">${p.batches?.name || 'Batch'}</p>
                                <p class="text-sm text-slate-500">${p.txn_id || 'N/A'}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-bold text-amber-600">Rs. ${p.amount.toLocaleString()}</p>
                                <p class="text-sm text-slate-400">${formatDate(p.payment_date)}</p>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            // Load bank details
            const { data: bankDetails } = await supabase
                .from('bank_details')
                .select('*')
                .limit(1)
                .single();

            const bankDiv = document.getElementById('bank-details');
            if (bankDetails) {
                bankDiv.innerHTML = `
                    <div class="space-y-3">
                        <div>
                            <p class="text-sm text-slate-500">Bank</p>
                            <p class="font-medium">${bankDetails.bank_name}</p>
                        </div>
                        <div>
                            <p class="text-sm text-slate-500">Account Name</p>
                            <p class="font-medium">${bankDetails.account_name}</p>
                        </div>
                        <div>
                            <p class="text-sm text-slate-500">Account Number</p>
                            <p class="font-medium font-mono">${bankDetails.account_number}</p>
                        </div>
                        <div>
                            <p class="text-sm text-slate-500">Branch</p>
                            <p class="font-medium">${bankDetails.branch || 'N/A'}</p>
                        </div>
                    </div>
                `;
            } else {
                bankDiv.innerHTML = '<p class="text-slate-500 text-sm">Bank details not available</p>';
            }
        }

        async function renderActivityLog() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <h1 class="font-display text-2xl font-bold mb-6">Activity Log</h1>
                <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>IP Address</th>
                                <th>Device</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="activity-tbody"></tbody>
                    </table>
                </div>
            `;

            const { data: logs } = await supabase
                .from('activity_logs')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false })
                .limit(50);

            const tbody = document.getElementById('activity-tbody');
            tbody.innerHTML = logs?.map(log => `
                <tr>
                    <td>${formatDateTime(log.created_at)}</td>
                    <td><code class="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">${log.ip_address || 'N/A'}</code></td>
                    <td class="truncate max-w-[200px]">${log.device_fingerprint?.substring(0, 20) || 'N/A'}...</td>
                    <td><span class="badge ${log.action === 'login' ? 'badge-success' : log.action === 'logout' ? 'badge-info' : 'badge-warning'}">${capitalizeFirst(log.action)}</span></td>
                </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-8 text-slate-500">No activity logs</td></tr>';
        }

        async function renderProfile() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <h1 class="font-display text-2xl font-bold mb-6">My Profile</h1>
                <div class="max-w-2xl">
                    <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                        <form id="profile-form" class="space-y-6">
                            <div class="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium mb-2">First Name</label>
                                    <input type="text" name="firstName" value="${userProfile.first_name || ''}" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-2">Last Name</label>
                                    <input type="text" name="lastName" value="${userProfile.last_name || ''}" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                                </div>
                            </div>
                            <div class="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium mb-2">WhatsApp</label>
                                    <input type="tel" name="whatsapp" value="${userProfile.whatsapp || ''}" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-2">District</label>
                                    <input type="text" name="district" value="${userProfile.district || ''}" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2">Address</label>
                                <textarea name="address" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl resize-none" rows="3">${userProfile.address || ''}</textarea>
                            </div>
                            <button type="submit" class="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium">
                                Update Profile
                            </button>
                        </form>
                    </div>
                    
                    <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mt-6">
                        <h3 class="font-semibold mb-4">Change Password</h3>
                        <form id="password-form" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-2">New Password</label>
                                <input type="password" name="newPassword" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2">Confirm Password</label>
                                <input type="password" name="confirmPassword" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                            </div>
                            <button type="submit" class="px-6 py-3 border border-slate-300 dark:border-slate-600 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                                Change Password
                            </button>
                        </form>
                    </div>
                </div>
            `;

            document.getElementById('profile-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                
                const { error } = await supabase
                    .from('profiles')
                    .update({
                        first_name: formData.get('firstName'),
                        last_name: formData.get('lastName'),
                        whatsapp: formData.get('whatsapp'),
                        district: formData.get('district'),
                        address: formData.get('address')
                    })
                    .eq('id', currentUser.id);

                if (error) {
                    showToast('Failed to update profile', 'error');
                } else {
                    userProfile.first_name = formData.get('firstName');
                    userProfile.last_name = formData.get('lastName');
                    updateUserUI();
                    showToast('Profile updated successfully', 'success');
                }
            });

            document.getElementById('password-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const newPass = formData.get('newPassword');
                const confirmPass = formData.get('confirmPassword');

                if (newPass !== confirmPass) {
                    showToast('Passwords do not match', 'error');
                    return;
                }

                const { error } = await supabase.auth.updateUser({ password: newPass });
                if (error) {
                    showToast(error.message, 'error');
                } else {
                    showToast('Password updated successfully', 'success');
                    e.target.reset();
                }
            });
        }

        // ============================================
        // QUIZ ENGINE
        // ============================================

        let currentQuiz = null;
        let currentQuestionIndex = 0;
        let quizAnswers = {};
        let quizTimer = null;
        let quizTimeRemaining = 0;

        async function startQuiz(quizId) {
            const { data: questions } = await supabase
                .from('quiz_questions')
                .select('*')
                .eq('quiz_id', quizId)
                .order('order_index', { ascending: true });

            const { data: quiz } = await supabase
                .from('quizzes')
                .select('*')
                .eq('id', quizId)
                .single();

            if (!questions || questions.length === 0) {
                showToast('No questions available for this quiz', 'error');
                return;
            }

            currentQuiz = quiz;
            currentQuestionIndex = 0;
            quizAnswers = {};
            quizTimeRemaining = (quiz.duration_minutes || 30) * 60;

            document.getElementById('quiz-title').textContent = quiz.title;
            document.getElementById('quiz-modal').classList.add('active');
            
            startQuizTimer();
            renderQuizQuestion(questions);
        }

        function startQuizTimer() {
            const timerEl = document.getElementById('quiz-timer');
            
            quizTimer = setInterval(() => {
                quizTimeRemaining--;
                const mins = Math.floor(quizTimeRemaining / 60);
                const secs = quizTimeRemaining % 60;
                timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                
                if (quizTimeRemaining <= 0) {
                    submitQuiz();
                }
            }, 1000);
        }

        function renderQuizQuestion(questions) {
            const body = document.getElementById('quiz-body');
            const progress = document.getElementById('quiz-progress');
            const q = questions[currentQuestionIndex];
            
            progress.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;

            body.innerHTML = `
                <div class="animate-fade-in-up">
                    <p class="text-lg font-medium mb-6">${q.question_text}</p>
                    <div class="space-y-3">
                        ${['A', 'B', 'C', 'D'].map(opt => `
                            <div onclick="selectQuizAnswer('${q.id}', '${opt}')" class="quiz-option ${quizAnswers[q.id] === opt ? 'selected' : ''} cursor-pointer">
                                <div class="flex items-center gap-3">
                                    <span class="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center font-medium">${opt}</span>
                                    <span>${q[`option_${opt.toLowerCase()}`]}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="flex justify-between mt-8">
                        <button onclick="prevQuizQuestion()" class="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg ${currentQuestionIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}" ${currentQuestionIndex === 0 ? 'disabled' : ''}>
                            Previous
                        </button>
                        ${currentQuestionIndex === questions.length - 1 
                            ? `<button onclick="submitQuiz()" class="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">Submit Quiz</button>`
                            : `<button onclick="nextQuizQuestion()" class="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">Next</button>`
                        }
                    </div>
                </div>
            `;

            window.selectQuizAnswer = (qId, answer) => {
                quizAnswers[qId] = answer;
                renderQuizQuestion(questions);
            };

            window.nextQuizQuestion = () => {
                if (currentQuestionIndex < questions.length - 1) {
                    currentQuestionIndex++;
                    renderQuizQuestion(questions);
                }
            };

            window.prevQuizQuestion = () => {
                if (currentQuestionIndex > 0) {
                    currentQuestionIndex--;
                    renderQuizQuestion(questions);
                }
            };

            window.submitQuiz = () => submitQuiz(questions);
        }

        async function submitQuiz(questions) {
            clearInterval(quizTimer);
            
            let score = 0;
            let totalMarks = 0;
            
            questions.forEach(q => {
                totalMarks += q.marks || 1;
                if (quizAnswers[q.id] === q.correct_answer) {
                    score += q.marks || 1;
                }
            });

            const percentage = Math.round((score / totalMarks) * 100);
            const passed = percentage >= (currentQuiz.pass_mark || 50);

            // Save attempt
            await supabase.from('quiz_attempts').insert({
                quiz_id: currentQuiz.id,
                student_id: currentUser.id,
                answers: quizAnswers,
                score: score,
                percentage: percentage,
                passed: passed,
                completed_at: new Date().toISOString()
            });

            // Show results
            const body = document.getElementById('quiz-body');
            body.innerHTML = `
                <div class="text-center py-8">
                    <div class="w-24 h-24 mx-auto rounded-full ${passed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'} flex items-center justify-center mb-6">
                        ${passed 
                            ? '<svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
                            : '<svg class="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
                        }
                    </div>
                    <h3 class="text-2xl font-bold mb-2">${passed ? 'Congratulations!' : 'Better luck next time!'}</h3>
                    <p class="text-slate-500 mb-6">You scored ${percentage}%</p>
                    
                    <div class="grid grid-cols-3 gap-4 mb-8">
                        <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                            <p class="text-2xl font-bold text-amber-600">${score}</p>
                            <p class="text-sm text-slate-500">Correct</p>
                        </div>
                        <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                            <p class="text-2xl font-bold text-red-600">${questions.length - score}</p>
                            <p class="text-sm text-slate-500">Wrong</p>
                        </div>
                        <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                            <p class="text-2xl font-bold">${percentage}%</p>
                            <p class="text-sm text-slate-500">Score</p>
                        </div>
                    </div>
                    
                    <button onclick="closeQuizModal()" class="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium">
                        Close
                    </button>
                </div>
            `;
        }

        function closeQuizModal() {
            clearInterval(quizTimer);
            document.getElementById('quiz-modal').classList.remove('active');
        }

        // ============================================
        // TEACHER & ADMIN PORTALS
        // ============================================

        async function renderTeacherDashboard() {
            const content = document.getElementById('main-content');
            
            const { count: pendingCount } = await supabase
                .from('enrollments')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            content.innerHTML = `
                <div class="animate-fade-in-up">
                    <h1 class="font-display text-2xl font-bold mb-6">Teacher Dashboard</h1>
                    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                            <p class="text-sm text-slate-500">Pending Approvals</p>
                            <p class="text-3xl font-bold text-amber-600 mt-2">${pendingCount || 0}</p>
                        </div>
                    </div>
                    <p class="text-slate-500">Use the sidebar to navigate to different sections.</p>
                </div>
            `;
        }

        async function renderApprovals() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <h1 class="font-display text-2xl font-bold mb-6">Pending Approvals</h1>
                <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Batch</th>
                                <th>Requested</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="approvals-tbody"></tbody>
                    </table>
                </div>
            `;

            const { data: pending } = await supabase
                .from('enrollments')
                .select('*, profiles(first_name, last_name, email), batches(name)')
                .eq('status', 'pending')
                .order('enrolled_at', { ascending: false })
                .limit(50);

            const tbody = document.getElementById('approvals-tbody');
            tbody.innerHTML = pending?.map(e => `
                <tr>
                    <td>
                        <p class="font-medium">${e.profiles?.first_name} ${e.profiles?.last_name}</p>
                        <p class="text-sm text-slate-500">${e.profiles?.email}</p>
                    </td>
                    <td>${e.batches?.name || 'N/A'}</td>
                    <td>${formatDateTime(e.enrolled_at)}</td>
                    <td>
                        <div class="flex gap-2">
                            <button onclick="approveEnrollment('${e.id}')" class="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600">Approve</button>
                            <button onclick="rejectEnrollment('${e.id}')" class="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600">Reject</button>
                        </div>
                    </td>
                </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-8 text-slate-500">No pending approvals</td></tr>';
        }

        async function approveEnrollment(id) {
            const { error } = await supabase
                .from('enrollments')
                .update({ status: 'approved', approved_by: currentUser.id, approved_at: new Date().toISOString() })
                .eq('id', id);
            
            if (error) {
                showToast('Failed to approve', 'error');
            } else {
                showToast('Enrollment approved', 'success');
                renderApprovals();
            }
        }

        async function rejectEnrollment(id) {
            const { error } = await supabase
                .from('enrollments')
                .update({ status: 'rejected', approved_by: currentUser.id, approved_at: new Date().toISOString() })
                .eq('id', id);
            
            if (error) {
                showToast('Failed to reject', 'error');
            } else {
                showToast('Enrollment rejected', 'success');
                renderApprovals();
            }
        }

        function renderTeacherStudents() { renderGenericList('Students', 'profiles', { role: 'student' }); }
        function renderContentManager() { renderGenericList('Content Manager', 'batches', {}); }
        function renderTeacherPayments() { renderGenericList('Payment Records', 'payment_records', {}); }
        function renderTeacherOrders() { renderGenericList('Orders', 'orders', {}); }

        function renderAdminDashboard() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <div class="animate-fade-in-up">
                    <h1 class="font-display text-2xl font-bold mb-6">Admin Dashboard</h1>
                    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 card-hover cursor-pointer" onclick="loadPage('a-students')">
                            <p class="text-sm text-slate-500">Total Students</p>
                            <p class="text-3xl font-bold text-blue-600 mt-2">--</p>
                        </div>
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 card-hover cursor-pointer" onclick="loadPage('a-teachers')">
                            <p class="text-sm text-slate-500">Teachers</p>
                            <p class="text-3xl font-bold text-green-600 mt-2">--</p>
                        </div>
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 card-hover cursor-pointer" onclick="loadPage('a-security')">
                            <p class="text-sm text-slate-500">Blocked Accounts</p>
                            <p class="text-3xl font-bold text-red-600 mt-2">--</p>
                        </div>
                    </div>
                    <p class="text-slate-500">Welcome to the Admin Portal. Use the sidebar to manage the platform.</p>
                </div>
            `;
        }

        function renderAdminSubjects() { renderGenericList('Subjects & Grades', 'subjects', {}); }
        function renderAdminTeachers() { renderGenericList('Teachers', 'profiles', { role: 'teacher' }); }
        function renderAdminStudents() { renderGenericList('Students', 'profiles', { role: 'student' }); }
        function renderAdminSecurity() { renderGenericList('Security (Blocked Users)', 'profiles', { is_blocked: true }); }
        
        function renderAdminSettings() {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <h1 class="font-display text-2xl font-bold mb-6">Platform Settings</h1>
                <div class="max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                    <h3 class="font-semibold mb-4">Payment Methods</h3>
                    <div class="space-y-3">
                        ${['bank_transfer', 'card', 'institute', 'cod', 'ezcash', 'binance', 'paypal', 'stripe'].map(m => `
                            <label class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg cursor-pointer">
                                <span>${capitalizeFirst(m.replace('_', ' '))}</span>
                                <input type="checkbox" class="w-5 h-5 text-amber-500 rounded" onchange="togglePaymentMethod('${m}', this.checked)">
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        async function renderGenericList(title, table, filters) {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <h1 class="font-display text-2xl font-bold mb-6">${title}</h1>
                <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <table class="data-table">
                        <thead><tr><th>Data</th><th>Actions</th></tr></thead>
                        <tbody id="generic-tbody"><tr><td colspan="2" class="text-center py-8">Loading...</td></tr></tbody>
                    </table>
                </div>
            `;

            let query = supabase.from(table).select('*').limit(50);
            Object.entries(filters).forEach(([key, val]) => {
                query = query.eq(key, val);
            });

            const { data } = await query;
            const tbody = document.getElementById('generic-tbody');
            
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" class="text-center py-8 text-slate-500">No data found</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(item => `
                <tr>
                    <td><pre class="text-xs overflow-auto max-w-md">${JSON.stringify(item, null, 2)}</pre></td>
                    <td>
                        ${table === 'profiles' && item.is_blocked ? `<button onclick="unblockUser('${item.id}')" class="px-3 py-1 bg-green-500 text-white rounded text-sm">Unblock</button>` : ''}
                        ${table === 'profiles' && !item.is_blocked ? `<button onclick="blockUser('${item.id}')" class="px-3 py-1 bg-red-500 text-white rounded text-sm">Block</button>` : ''}
                    </td>
                </tr>
            `).join('');
        }

        async function unblockUser(userId) {
            const { error } = await supabase
                .from('profiles')
                .update({ is_blocked: false, block_reason: null })
                .eq('id', userId);
            
            if (error) {
                showToast('Failed to unblock user', 'error');
            } else {
                showToast('User unblocked successfully', 'success');
                loadPage(currentPage); // Reload current page
            }
        }

        async function blockUser(userId) {
            const reason = prompt('Enter reason for blocking:');
            if (!reason) return;

            const { error } = await supabase
                .from('profiles')
                .update({ is_blocked: true, block_reason: reason })
                .eq('id', userId);
            
            if (error) {
                showToast('Failed to block user', 'error');
            } else {
                showToast('User blocked successfully', 'success');
                loadPage(currentPage);
            }
        }

        async function togglePaymentMethod(method, enabled) {
            const key = `payment_${method}`;
            const { error } = await supabase
                .from('settings')
                .update({ value: enabled.toString() })
                .eq('key', key);
            
            if (error) {
                showToast('Failed to update setting', 'error');
            } else {
                showToast('Setting updated', 'success');
            }
        }

        // ============================================
        // UI INTERACTION FUNCTIONS
        // ============================================

        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            sidebar.classList.toggle('open');
            overlay.classList.toggle('hidden');
        }

        function closeSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            sidebar.classList.remove('open');
            overlay.classList.add('hidden');
        }

        function toggleNotifications() {
            const dropdown = document.getElementById('notifications-dropdown');
            dropdown.classList.toggle('hidden');
            
            // Close profile menu if open
            document.getElementById('profile-dropdown').classList.add('hidden');
        }

        function toggleProfileMenu() {
            const dropdown = document.getElementById('profile-dropdown');
            dropdown.classList.toggle('hidden');
            
            // Close notifications if open
            document.getElementById('notifications-dropdown').classList.add('hidden');
        }

        function enableShippingEdit(fieldId) {
            const field = document.getElementById(`ship-${fieldId}`);
            if (field) {
                field.readOnly = false;
                field.focus();
            }
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#notifications-dropdown') && !e.target.closest('[onclick="toggleNotifications()"]')) {
                document.getElementById('notifications-dropdown')?.classList.add('hidden');
            }
            if (!e.target.closest('#profile-dropdown') && !e.target.closest('[onclick="toggleProfileMenu()"]')) {
                document.getElementById('profile-dropdown')?.classList.add('hidden');
            }
        });

        // ============================================
        // TOAST NOTIFICATIONS
        // ============================================

        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            
            container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // ============================================
        // UTILITY FUNCTIONS
        // ============================================

        function formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            const options = { year: 'numeric', month: 'short', day: 'numeric' };
            return new Date(dateStr).toLocaleDateString('en-US', options);
        }

        function formatDateTime(dateStr) {
            if (!dateStr) return 'N/A';
            const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
            return new Date(dateStr).toLocaleDateString('en-US', options);
        }

        function capitalizeFirst(str) {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1);
        }

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        function generateYearOptions() {
            const currentYear = new Date().getFullYear();
            const years = [];
            for (let y = currentYear; y >= currentYear - 5; y--) {
                years.push(`<option value="${y}">${y}</option>`);
            }
            return years.join('');
        }

        function getStatusBadgeClass(status) {
            const classes = {
                'pending': 'badge-warning',
                'approved': 'badge-success',
                'rejected': 'badge-danger',
                'shipped': 'badge-info',
                'delivered': 'badge-success',
                'cancelled': 'badge-danger'
            };
            return classes[status] || 'badge-info';
        }

        function renderPagination(currentPage, totalPages, loadFunctionName) {
            let html = '';
            
            if (currentPage > 1) {
                html += `<button onclick="${loadFunctionName}(${currentPage - 1})" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Previous</button>`;
            }
            
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                    html += `<button onclick="${loadFunctionName}(${i})" class="px-4 py-2 rounded-lg ${i === currentPage ? 'bg-amber-500 text-white' : 'border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}">${i}</button>`;
                } else if (i === currentPage - 2 || i === currentPage + 2) {
                    html += `<span class="px-2">...</span>`;
                }
            }
            
            if (currentPage < totalPages) {
                html += `<button onclick="${loadFunctionName}(${currentPage + 1})" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Next</button>`;
            }
            
            return html;
        }

        // ============================================
        // DEVICE & SECURITY UTILITIES
        // ============================================

        async function generateDeviceFingerprint() {
            // Simple fingerprinting using canvas and user agent
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = "14px 'Arial'";
            ctx.fillText('fingerprint', 2, 2);
            
            const fingerprint = [
                navigator.userAgent,
                navigator.language,
                screen.width + 'x' + screen.height,
                new Date().getTimezoneOffset(),
                canvas.toDataURL()
            ].join('|');
            
            // Simple hash function
            let hash = 0;
            for (let i = 0; i < fingerprint.length; i++) {
                const char = fingerprint.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        }

        async function getIPAddress() {
            try {
                const response = await fetch('https://api.ipify.org?format=json');
                const data = await response.json();
                return data.ip;
            } catch (error) {
                console.log('Could not fetch IP');
                return 'Unknown';
            }
        }

        // ============================================
        // NOTIFICATIONS
        // ============================================

        async function subscribeToNotifications() {
            if (!currentUser) return;
            
            // Subscribe to new notifications
            const channel = supabase
                .channel('notifications')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${currentUser.id}`
                }, (payload) => {
                    showToast(payload.new.message, 'info');
                    updateNotificationBadge();
                })
                .subscribe();
            
            // Initial badge update
            updateNotificationBadge();
        }

        async function updateNotificationBadge() {
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', currentUser.id)
                .eq('is_read', false);
            
            const badge = document.getElementById('notification-count');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }

        // ============================================
        // FLOATING WHATSAPP BUTTON (TEACHER)
        // ============================================

        function renderWhatsAppButton(phoneNumber, message = 'Hello, I have a question.') {
            // Remove existing if any
            const existing = document.getElementById('wa-float-btn');
            if (existing) existing.remove();
            
            const btn = document.createElement('a');
            btn.id = 'wa-float-btn';
            btn.href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
            btn.target = '_blank';
            btn.className = 'fixed bottom-6 right-6 w-14 h-14 bg-green-500 rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors z-40';
            btn.innerHTML = `<svg class="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
            
            document.body.appendChild(btn);
        }

        // Expose necessary functions globally
        window.loadPage = loadPage;
        window.toggleSidebar = toggleSidebar;
        window.toggleTheme = toggleTheme;
        window.logout = logout;
        window.openCart = openCart;
        window.closeCart = closeCart;
        window.addToCart = addToCart;
        window.removeFromCart = removeFromCart;
        window.updateCartQuantity = updateCartQuantity;
        window.proceedToCheckout = proceedToCheckout;
        window.nextCheckoutStep = nextCheckoutStep;
        window.prevCheckoutStep = prevCheckoutStep;
        window.selectPayment = selectPayment;
        window.saveShippingAndNext = saveShippingAndNext;
        window.placeOrder = placeOrder;
        window.startQuiz = startQuiz;
        window.closeQuizModal = closeQuizModal;
        window.markAsReceived = markAsReceived;
        window.approveEnrollment = approveEnrollment;
        window.rejectEnrollment = rejectEnrollment;
        window.unblockUser = unblockUser;
        window.blockUser = blockUser;
        window.toggleNotifications = toggleNotifications;
        window.toggleProfileMenu = toggleProfileMenu;
        window.enableShippingEdit = enableShippingEdit;
        window.togglePaymentMethod = togglePaymentMethod;
        window.loadProducts = loadProducts;
        window.filterRecordings = filterRecordings;
        window.searchProducts = searchProducts;

        console.log('Nova X Edu Application Initialized');
