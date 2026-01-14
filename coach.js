// Coach Profile Page JavaScript

// Check if user is logged in (has any account on the platform)
function isLoggedIn() {
    return sessionStorage.getItem('userRole') !== null;
}

// Check if current user can edit coaches
function canEditCoach() {
    try {
        const userRoleStr = sessionStorage.getItem('userRole');
        if (!userRoleStr) return false;

        const userRole = JSON.parse(userRoleStr);
        return userRole.can_edit_students === true || userRole.role === 'admin';
    } catch (error) {
        console.error('Error checking edit permission:', error);
        return false;
    }
}

// Show dashboard button for logged-in users
function updateDashboardButton() {
    const dashboardButton = document.getElementById('dashboardButton');
    if (dashboardButton && isLoggedIn()) {
        dashboardButton.style.display = 'inline-flex';
        if (window.applyTranslations) {
            window.applyTranslations(dashboardButton);
        }
    }
}

// Wait for data to load from Supabase before rendering
async function initializeCoachProfile() {
    const coachId = localStorage.getItem('selectedCoachId');

    if (!coachId) {
        window.location.href = 'index.html';
        return;
    }

    let coach = null;

    // Load coach directly from Supabase
    if (window.supabaseData && typeof window.supabaseData.getCoachById === 'function') {
        try {
            coach = await window.supabaseData.getCoachById(coachId);
        } catch (error) {
            console.error('Error loading coach:', error);
        }
    }

    // Fallback: try to find in coaches array if direct query failed
    if (!coach && typeof coaches !== 'undefined' && coaches.length > 0) {
        coach = coaches.find(c => String(c.id) === String(coachId));
    }

    if (!coach) {
        showToast(t('coach.notFound') || 'Coach not found. Redirecting to home page.', 'error');
        window.location.href = 'index.html';
        return;
    }

    // Store coach reference globally
    window.currentCoach = coach;
    window.currentCoachName = `${coach.firstName} ${coach.lastName}`;

    if (typeof window.updateCoachTitle === 'function') {
        window.updateCoachTitle(window.currentCoachName);
    }

    // Load coach's students count
    await loadCoachStudents(coach);

    // Render the profile
    renderCoachProfile();

    // Check if we should auto-open the edit modal (from dashboard edit button)
    if (localStorage.getItem('openCoachEdit') === 'true') {
        localStorage.removeItem('openCoachEdit');
        if (canEditCoach()) {
            // Small delay to ensure profile is fully rendered
            setTimeout(() => {
                openEditCoachModal();
            }, 100);
        }
    }
}

// Load students for this coach
async function loadCoachStudents(coach) {
    const coachFullName = `${coach.firstName} ${coach.lastName}`;

    if (window.supabaseData && typeof window.supabaseData.getStudents === 'function') {
        try {
            const allStudents = await window.supabaseData.getStudents();
            window.coachStudents = allStudents.filter(s => s.coach === coachFullName);
        } catch (error) {
            console.error('Error loading students:', error);
            window.coachStudents = [];
        }
    } else if (typeof students !== 'undefined' && Array.isArray(students)) {
        window.coachStudents = students.filter(s => s.coach === coachFullName);
    } else {
        window.coachStudents = [];
    }
}

// Render the coach profile
function renderCoachProfile() {
    const coach = window.currentCoach;
    const coachStudents = window.coachStudents || [];

    if (!coach) return;

    const profileContainer = document.getElementById('coachProfile');
    if (!profileContainer) return;

    // Calculate statistics
    const totalStudents = coachStudents.length;
    const activeStudents = coachStudents.filter(s => s.status === 'active').length;
    const avgLevel = coachStudents.length > 0
        ? (coachStudents.reduce((sum, s) => sum + (s.currentLevel || 1), 0) / coachStudents.length).toFixed(1)
        : '0';
    const titledStudents = coachStudents.filter(s => s.razryad && s.razryad !== '' && s.razryad !== 'none' && s.razryad !== 'None').length;

    // Avatar content (clickable to open lightbox)
    const coachFullName = `${coach.firstName} ${coach.lastName}`;
    const avatarContent = coach.photoUrl
        ? `<img src="${coach.photoUrl}" alt="${coach.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onclick="openAvatarLightbox('${coach.photoUrl}', '${coachFullName}', 'coach')" class="avatar-clickable">`
        : `<span onclick="openAvatarLightbox(null, '${coachFullName}', 'coach', '${coach.firstName[0]}${coach.lastName[0]}')" class="avatar-clickable" style="cursor: pointer;">${coach.firstName[0]}${coach.lastName[0]}</span>`;

    // Branch name
    const branchName = coach.branchName || coach.branch || t('coach.noBranch') || 'No Branch';

    // Bio text
    const bioText = coach.bio || t('admin.coaches.defaultBio') || 'Chess coach at Chess Empire';

    // Social links HTML
    let socialsHTML = '';
    if (coach.instagramUrl || coach.whatsappUrl) {
        socialsHTML = `
            <div class="coach-socials">
                ${coach.instagramUrl ? `
                    <a href="${coach.instagramUrl}" target="_blank" rel="noopener noreferrer" class="coach-social-btn instagram">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                        <span>Instagram</span>
                    </a>
                ` : ''}
                ${coach.whatsappUrl ? `
                    <a href="${coach.whatsappUrl}" target="_blank" rel="noopener noreferrer" class="coach-social-btn whatsapp">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        <span>WhatsApp</span>
                    </a>
                ` : ''}
            </div>
        `;
    }

    // Students list HTML
    let studentsListHTML = '';
    if (coachStudents.length > 0) {
        const sortedStudents = [...coachStudents].sort((a, b) => {
            // Sort by level descending, then by name
            if ((b.currentLevel || 1) !== (a.currentLevel || 1)) {
                return (b.currentLevel || 1) - (a.currentLevel || 1);
            }
            return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        });

        studentsListHTML = `
            <div class="coach-students-section">
                <h3 class="section-title">
                    <i data-lucide="users" style="width: 20px; height: 20px;"></i>
                    ${t('coach.myStudents') || 'My Students'}
                </h3>
                <div class="students-grid">
                    ${sortedStudents.slice(0, 20).map(student => {
                        const statusClass = student.status === 'active' ? 'status-active' :
                                          student.status === 'frozen' ? 'status-frozen' : 'status-left';
                        const razryadBadge = student.razryad ? `<span class="razryad-badge">${student.razryad}</span>` : '';

                        return `
                            <div class="student-item" onclick="viewStudent('${student.id}')">
                                <div class="student-avatar-small">
                                    ${student.photoUrl
                                        ? `<img src="${student.photoUrl}" alt="${student.firstName}">`
                                        : `${student.firstName[0]}${student.lastName[0]}`
                                    }
                                </div>
                                <div class="student-info">
                                    <div class="student-name-row">
                                        <span class="student-name">${student.firstName} ${student.lastName}</span>
                                        ${razryadBadge}
                                    </div>
                                    <div class="student-meta">
                                        <span class="student-level">${t('coach.level') || 'Level'} ${student.currentLevel || 1}</span>
                                        <span class="status-dot ${statusClass}"></span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${coachStudents.length > 20 ? `
                    <div class="students-more">
                        ${t('coach.andMore', { count: coachStudents.length - 20 }) || `And ${coachStudents.length - 20} more students...`}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Edit button HTML (only for logged-in users with permission)
    const editButtonHTML = canEditCoach() ? `
        <button class="edit-button" onclick="openEditCoachModal()">
            <i data-lucide="edit" style="width: 16px; height: 16px;"></i>
            <span class="edit-text">${t('coach.edit') || 'Edit'}</span>
        </button>
    ` : '';

    profileContainer.innerHTML = `
        <div class="profile-header">
            <div class="coach-avatar">
                ${avatarContent}
            </div>
            <div class="profile-info">
                <h1 class="coach-name">${coach.firstName} ${coach.lastName}</h1>
                <div class="coach-branch">
                    <i data-lucide="map-pin" style="width: 16px; height: 16px;"></i>
                    ${i18n.translateBranchName(branchName)}
                </div>
            </div>
            ${editButtonHTML}
        </div>

        <div class="coach-bio-section">
            <p class="coach-bio">${bioText}</p>
        </div>

        <div class="coach-stats">
            <div class="stat-card">
                <div class="stat-value">${totalStudents}</div>
                <div class="stat-label">${t('coach.totalStudents') || 'Total Students'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${activeStudents}</div>
                <div class="stat-label">${t('coach.activeStudents') || 'Active'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgLevel}</div>
                <div class="stat-label">${t('coach.avgLevel') || 'Avg Level'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${titledStudents}</div>
                <div class="stat-label">${t('coach.titledStudents') || 'Titled'}</div>
            </div>
        </div>

        <div class="coach-contact-section">
            <h3 class="section-title">
                <i data-lucide="contact" style="width: 20px; height: 20px;"></i>
                ${t('coach.contactInfo') || 'Contact Information'}
            </h3>
            <div class="contact-grid">
                ${coach.phone ? `
                    <a href="https://wa.me/${coach.phone.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener noreferrer" class="contact-item contact-whatsapp">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        <span>${coach.phone}</span>
                    </a>
                ` : ''}
                ${coach.email ? `
                    <a href="mailto:${coach.email}" class="contact-item">
                        <i data-lucide="mail" style="width: 18px; height: 18px;"></i>
                        <span>${coach.email}</span>
                    </a>
                ` : ''}
            </div>
            ${socialsHTML}
        </div>

        ${studentsListHTML}
    `;

    // Initialize Lucide icons
    lucide.createIcons();
}

// Navigate to student profile
function viewStudent(studentId) {
    localStorage.setItem('selectedStudentId', studentId);
    window.location.href = 'student.html';
}

// Open edit coach modal
async function openEditCoachModal() {
    const coach = window.currentCoach;
    if (!coach) return;

    // Load branches if not already loaded
    if (!window.branches && window.supabaseData) {
        window.branches = await window.supabaseData.getBranches();
    }

    // Create modal HTML
    const modalHTML = `
        <div id="editCoachModal" class="modal active">
            <div class="modal-overlay" onclick="closeEditCoachModal()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">${t('admin.modals.coach.editTitle') || 'Edit Coach'}</h2>
                    <button class="modal-close" onclick="closeEditCoachModal()">
                        <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                    </button>
                </div>

                <form id="editCoachForm" class="modal-body">
                    <!-- Photo Upload -->
                    <div class="form-section">
                        <h3 class="form-section-title">${t('admin.modals.coach.photo') || 'Photo'}</h3>
                        <div class="photo-upload-container">
                            <div class="photo-preview" id="editCoachPhotoPreview">
                                ${coach.photoUrl
                                    ? `<img src="${coach.photoUrl}" alt="${coach.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                                    : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); border-radius: 50%; color: white; font-size: 2rem; font-weight: 700;">${coach.firstName[0]}${coach.lastName[0]}</div>`
                                }
                            </div>
                            <div class="photo-upload-actions">
                                <label for="editCoachPhotoUpload" class="btn-upload">
                                    <i data-lucide="upload" style="width: 18px; height: 18px;"></i>
                                    <span>${t('admin.modals.coach.uploadPhoto') || 'Upload Photo'}</span>
                                </label>
                                <input type="file" id="editCoachPhotoUpload" accept="image/*" style="display: none;" onchange="previewCoachPhoto(event)">
                                <button type="button" class="btn-remove-photo" onclick="removeCoachPhoto()" ${!coach.photoUrl ? 'style="display: none;"' : ''} id="removeCoachPhotoBtn">
                                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                                    <span>${t('admin.modals.coach.removePhoto') || 'Remove'}</span>
                                </button>
                            </div>
                        </div>
                        <input type="hidden" id="editCoachCurrentPhotoUrl" value="${coach.photoUrl || ''}">
                    </div>

                    <!-- Coach Information -->
                    <div class="form-section">
                        <h3 class="form-section-title">${t('admin.modals.coach.coachInfo') || 'Coach Information'}</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="editCoachFirstName" class="form-label">${t('admin.modals.coach.firstName') || 'First Name'}</label>
                                <input type="text" id="editCoachFirstName" class="form-input" value="${coach.firstName}" required>
                            </div>
                            <div class="form-group">
                                <label for="editCoachLastName" class="form-label">${t('admin.modals.coach.lastName') || 'Last Name'}</label>
                                <input type="text" id="editCoachLastName" class="form-input" value="${coach.lastName}" required>
                            </div>
                        </div>
                    </div>

                    <!-- Bio -->
                    <div class="form-section">
                        <h3 class="form-section-title">${t('admin.modals.coach.bio') || 'Bio'}</h3>
                        <div class="form-group">
                            <textarea id="editCoachBio" class="form-input" rows="3" maxlength="500" placeholder="${t('admin.modals.coach.bioPlaceholder') || 'Tell us about your coaching experience...'}">${coach.bio || ''}</textarea>
                        </div>
                    </div>

                    <!-- Contact Information -->
                    <div class="form-section">
                        <h3 class="form-section-title">${t('admin.modals.coach.contactInfo') || 'Contact Information'}</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="editCoachPhone" class="form-label">${t('admin.modals.coach.phone') || 'Phone'}</label>
                                <input type="tel" id="editCoachPhone" class="form-input" value="${coach.phone || ''}" placeholder="+7 (XXX) XXX-XX-XX">
                            </div>
                            <div class="form-group">
                                <label for="editCoachEmail" class="form-label">${t('admin.modals.coach.email') || 'Email'}</label>
                                <input type="email" id="editCoachEmail" class="form-input" value="${coach.email || ''}" placeholder="coach@example.com">
                            </div>
                        </div>
                    </div>

                    <!-- Social Links -->
                    <div class="form-section">
                        <h3 class="form-section-title">${t('admin.modals.coach.socialLinks') || 'Social Links'}</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="editCoachInstagram" class="form-label">Instagram</label>
                                <input type="url" id="editCoachInstagram" class="form-input" value="${coach.instagramUrl || ''}" placeholder="https://instagram.com/username">
                            </div>
                            <div class="form-group">
                                <label for="editCoachWhatsapp" class="form-label">WhatsApp</label>
                                <input type="url" id="editCoachWhatsapp" class="form-input" value="${coach.whatsappUrl || ''}" placeholder="https://wa.me/77001234567">
                            </div>
                        </div>
                    </div>

                    <!-- Branch Assignment -->
                    <div class="form-section">
                        <h3 class="form-section-title">${t('admin.modals.coach.branchAssignment') || 'Branch Assignment'}</h3>
                        <div class="form-group">
                            <label for="editCoachBranch" class="form-label">${t('admin.modals.coach.branch') || 'Branch'}</label>
                            <select id="editCoachBranch" class="form-input" required>
                                <option value="">${t('admin.modals.coach.selectBranch') || 'Select branch...'}</option>
                                ${(window.branches || []).map(branch => `
                                    <option value="${branch.id}" ${branch.id === coach.branchId ? 'selected' : ''}>${branch.name}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                </form>

                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeEditCoachModal()">${t('admin.modals.coach.cancel') || 'Cancel'}</button>
                    <button type="submit" class="btn-primary" onclick="saveCoachEdits(event)">
                        <i data-lucide="save" style="width: 18px; height: 18px;"></i>
                        <span>${t('admin.modals.coach.save') || 'Save Coach'}</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

// Close edit coach modal
function closeEditCoachModal() {
    const modal = document.getElementById('editCoachModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// Preview coach photo
function previewCoachPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('editCoachPhotoPreview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

        const removeBtn = document.getElementById('removeCoachPhotoBtn');
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    };
    reader.readAsDataURL(file);
}

// Remove coach photo
function removeCoachPhoto() {
    const coach = window.currentCoach;
    const preview = document.getElementById('editCoachPhotoPreview');
    preview.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); border-radius: 50%; color: white; font-size: 2rem; font-weight: 700;">${coach.firstName[0]}${coach.lastName[0]}</div>`;

    document.getElementById('editCoachPhotoUpload').value = '';
    document.getElementById('editCoachCurrentPhotoUrl').value = '';

    const removeBtn = document.getElementById('removeCoachPhotoBtn');
    if (removeBtn) removeBtn.style.display = 'none';
}

// Save coach edits
async function saveCoachEdits(event) {
    event.preventDefault();

    const coach = window.currentCoach;
    if (!coach) return;

    const firstName = document.getElementById('editCoachFirstName').value.trim();
    const lastName = document.getElementById('editCoachLastName').value.trim();
    const bio = document.getElementById('editCoachBio').value.trim();
    const phone = document.getElementById('editCoachPhone').value.trim();
    const email = document.getElementById('editCoachEmail').value.trim();
    const instagramUrl = document.getElementById('editCoachInstagram').value.trim();
    const whatsappUrl = document.getElementById('editCoachWhatsapp').value.trim();
    const branchId = document.getElementById('editCoachBranch').value;

    if (!firstName || !lastName) {
        showToast(t('admin.modals.coach.nameRequired') || 'First and last name are required', 'error');
        return;
    }

    if (!branchId) {
        showToast(t('admin.modals.coach.branchRequired') || 'Please select a branch', 'error');
        return;
    }

    try {
        // Handle photo upload
        let photoUrl = document.getElementById('editCoachCurrentPhotoUrl').value;
        const photoInput = document.getElementById('editCoachPhotoUpload');

        if (photoInput.files && photoInput.files[0]) {
            // Upload new photo
            if (window.supabaseData && typeof window.supabaseData.uploadCoachPhoto === 'function') {
                const uploadedUrl = await window.supabaseData.uploadCoachPhoto(photoInput.files[0], coach.id);
                if (uploadedUrl) {
                    // Delete old photo if exists
                    if (coach.photoUrl && typeof window.supabaseData.deleteCoachPhoto === 'function') {
                        await window.supabaseData.deleteCoachPhoto(coach.photoUrl);
                    }
                    photoUrl = uploadedUrl;
                }
            }
        } else if (!photoUrl && coach.photoUrl) {
            // Photo was removed
            if (window.supabaseData && typeof window.supabaseData.deleteCoachPhoto === 'function') {
                await window.supabaseData.deleteCoachPhoto(coach.photoUrl);
            }
            photoUrl = null;
        }

        // Update coach data
        const coachData = {
            firstName,
            lastName,
            bio: bio || null,
            phone: phone || null,
            email: email || null,
            instagramUrl: instagramUrl || null,
            whatsappUrl: whatsappUrl || null,
            branchId,
            photoUrl
        };

        if (window.supabaseData && typeof window.supabaseData.updateCoach === 'function') {
            const updatedCoach = await window.supabaseData.updateCoach(coach.id, coachData);

            // Update global reference
            window.currentCoach = updatedCoach;
            window.currentCoachName = `${updatedCoach.firstName} ${updatedCoach.lastName}`;

            // Close modal and refresh
            closeEditCoachModal();
            renderCoachProfile();

            showToast(t('admin.modals.coach.editSuccess') || 'Coach updated successfully!', 'success');
        }
    } catch (error) {
        console.error('Error saving coach:', error);
        showToast(t('admin.modals.coach.editError') || 'Error saving coach. Please try again.', 'error');
    }
}

// ==================== Avatar Lightbox ====================

// Open avatar lightbox to show enlarged photo
function openAvatarLightbox(photoUrl, name, type = 'coach', initials = '') {
    // Remove existing lightbox if any
    closeAvatarLightbox();

    // Create lightbox HTML
    const lightboxHTML = `
        <div id="avatarLightbox" class="avatar-lightbox">
            <div class="avatar-lightbox-overlay" onclick="closeAvatarLightbox()"></div>
            <div class="avatar-lightbox-content">
                <button class="avatar-lightbox-close" onclick="closeAvatarLightbox()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                ${photoUrl
                    ? `<img src="${photoUrl}" alt="${name}" class="avatar-lightbox-image">`
                    : `<div class="avatar-lightbox-initials ${type}-avatar">${initials}</div>`
                }
                <div class="avatar-lightbox-name">${name}</div>
            </div>
        </div>
    `;

    // Add to DOM
    document.body.insertAdjacentHTML('beforeend', lightboxHTML);

    // Trigger animation
    requestAnimationFrame(() => {
        document.getElementById('avatarLightbox').classList.add('active');
    });

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Close on Escape key
    document.addEventListener('keydown', handleLightboxEscape);
}

// Close avatar lightbox
function closeAvatarLightbox() {
    const lightbox = document.getElementById('avatarLightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
        setTimeout(() => {
            lightbox.remove();
            document.body.style.overflow = '';
        }, 300);
    }
    document.removeEventListener('keydown', handleLightboxEscape);
}

// Handle Escape key to close lightbox
function handleLightboxEscape(e) {
    if (e.key === 'Escape') {
        closeAvatarLightbox();
    }
}

// Make functions globally available
window.openEditCoachModal = openEditCoachModal;
window.closeEditCoachModal = closeEditCoachModal;
window.previewCoachPhoto = previewCoachPhoto;
window.removeCoachPhoto = removeCoachPhoto;
window.saveCoachEdits = saveCoachEdits;
window.canEditCoach = canEditCoach;
window.openAvatarLightbox = openAvatarLightbox;
window.closeAvatarLightbox = closeAvatarLightbox;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for i18n to be ready
    if (window.i18n && typeof window.i18n.waitForReady === 'function') {
        await window.i18n.waitForReady();
    }

    // Apply translations
    if (window.applyTranslations) {
        window.applyTranslations();
    }

    // Show dashboard button if logged in
    updateDashboardButton();

    // Initialize profile
    await initializeCoachProfile();
});
