// Registration page logic
(function() {
    'use strict';

    // Initialize Lucide icons
    lucide.createIcons();

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const invitationToken = urlParams.get('token');

    // DOM elements
    const registerForm = document.getElementById('registerForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const registerButton = document.getElementById('registerButton');
    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const infoMessage = document.getElementById('infoMessage');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    // State
    let invitationData = null;

    // Apply translations on load
    window.addEventListener('load', () => {
        if (window.i18n && window.i18n.translatePage) {
            window.i18n.translatePage();
        }
        lucide.createIcons();
    });

    // Language change listener
    document.addEventListener('languagechange', () => {
        if (window.i18n && window.i18n.translatePage) {
            window.i18n.translatePage();
        }
        lucide.createIcons();
    });

    // Validate invitation token on load
    async function validateInvitation() {
        if (!invitationToken) {
            showError('Invalid invitation link. Please use the link from your invitation email.');
            registerButton.disabled = true;
            return;
        }

        if (!window.supabaseClient) {
            showError('Registration service not available. Please try again later.');
            registerButton.disabled = true;
            return;
        }

        try {
            showInfo('Validating invitation...');

            // Check if invitation exists and is valid
            const { data, error } = await window.supabaseClient
                .from('coach_invitations')
                .select('*')
                .eq('token', invitationToken)
                .single();

            if (error || !data) {
                throw new Error('Invitation not found or has expired.');
            }

            // Check if invitation has been used
            if (data.used) {
                throw new Error('This invitation has already been used.');
            }

            // Check if invitation has expired
            const expiresAt = new Date(data.expires_at);
            if (expiresAt < new Date()) {
                throw new Error('This invitation has expired.');
            }

            // Store invitation data
            invitationData = data;

            // Pre-fill email
            emailInput.value = data.email;

            hideMessages();
            console.log('✅ Invitation validated successfully');

        } catch (error) {
            console.error('Invitation validation error:', error);
            showError(error.message || 'Invalid invitation. Please contact the administrator.');
            registerButton.disabled = true;
        }
    }

    // Password toggle handlers
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        const icon = togglePassword.querySelector('i');
        icon.setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
        lucide.createIcons();
    });

    toggleConfirmPassword.addEventListener('click', () => {
        const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        confirmPasswordInput.setAttribute('type', type);
        const icon = toggleConfirmPassword.querySelector('i');
        icon.setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
        lucide.createIcons();
    });

    // Password validation
    function validatePassword(password) {
        const checks = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password)
        };

        // Update visual checklist
        document.getElementById('length-check').classList.toggle('valid', checks.length);
        document.getElementById('uppercase-check').classList.toggle('valid', checks.uppercase);
        document.getElementById('lowercase-check').classList.toggle('valid', checks.lowercase);
        document.getElementById('number-check').classList.toggle('valid', checks.number);

        return Object.values(checks).every(check => check);
    }

    // Real-time password validation
    passwordInput.addEventListener('input', () => {
        validatePassword(passwordInput.value);
    });

    // Form submission
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!invitationData) {
            showError('Invalid invitation. Please use the link from your invitation email.');
            return;
        }

        const email = emailInput.value;
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Validate passwords match
        if (password !== confirmPassword) {
            showError('Passwords do not match. Please try again.');
            return;
        }

        // Validate password strength
        if (!validatePassword(password)) {
            showError('Password does not meet the requirements. Please check the criteria below.');
            return;
        }

        // Disable form
        registerButton.disabled = true;
        registerButton.innerHTML = '<div class="spinner"></div><span>Creating account...</span>';
        hideMessages();

        try {
            // User account was already created by inviteUserByEmail()
            // We need to set their password using updateUser()
            const { data: authData, error: updateError } = await window.supabaseClient.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            console.log('✅ User password set:', authData.user.id);

            // Mark invitation as used
            const { error: invitationError } = await window.supabaseClient
                .from('coach_invitations')
                .update({ used: true })
                .eq('token', invitationToken);

            if (invitationError) {
                console.error('Failed to mark invitation as used:', invitationError);
                // Don't throw - account is created, this is just cleanup
            }

            // Create user role entry (default to coach so they can access dashboard)
            const { error: roleError } = await window.supabaseClient
                .from('user_roles')
                .insert({
                    user_id: authData.user.id,
                    role: 'coach',
                    can_view_all_students: false,
                    can_edit_students: false,
                    can_manage_branches: false,
                    can_manage_coaches: false
                });

            if (roleError) {
                console.error('Failed to create user role:', roleError);
                // Don't throw - admin can create role manually
            }

            showSuccess('Account created successfully! Redirecting to login page...');

            // Sign out the user before redirecting to login
            // This ensures the password update is committed and there are no session conflicts
            await window.supabaseClient.auth.signOut();
            console.log('✅ User signed out, redirecting to login page');

            // Redirect to login page
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);

        } catch (error) {
            console.error('Registration error:', error);

            let errorMsg = 'Registration failed. Please try again.';

            if (error.message.includes('already registered')) {
                errorMsg = 'This email is already registered. Please use the login page.';
            } else if (error.message.includes('password')) {
                errorMsg = 'Password does not meet requirements. Please choose a stronger password.';
            } else if (error.message) {
                errorMsg = error.message;
            }

            showError(errorMsg);
            resetRegisterButton();
        }
    });

    // Helper functions
    function showInfo(message) {
        infoMessage.textContent = message;
        infoMessage.classList.add('show');
        errorMessage.classList.remove('show');
        successMessage.classList.remove('show');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        infoMessage.classList.remove('show');
        successMessage.classList.remove('show');
    }

    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.classList.add('show');
        infoMessage.classList.remove('show');
        errorMessage.classList.remove('show');
    }

    function hideMessages() {
        infoMessage.classList.remove('show');
        errorMessage.classList.remove('show');
        successMessage.classList.remove('show');
    }

    function resetRegisterButton() {
        const labelText = (window.t && typeof window.t === 'function')
            ? window.t('register.createAccountButton')
            : 'Create Account';

        const markup = `
            <span class="button-icon" aria-hidden="true">
                <i data-lucide="user-plus" style="width: 18px; height: 18px;"></i>
            </span>
            <span data-i18n="register.createAccountButton">${labelText}</span>
        `.trim();

        registerButton.innerHTML = markup;
        registerButton.disabled = false;
        lucide.createIcons();
    }

    // Initialize
    validateInvitation();
})();
