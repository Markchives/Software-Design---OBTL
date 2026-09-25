/* ============================================================
   EduMetrics - Shared JavaScript
   Academic Assessment & Grading System
   ============================================================ */


/* ============================================================
   GENERAL HELPERS
   ============================================================ */

/**
 * Get an element safely.
 */
function getElement(id) {
    return document.getElementById(id);
}


/**
 * Check whether an element exists.
 */
function elementExists(id) {
    return getElement(id) !== null;
}


/**
 * Open a modal.
 */
function openModal(modalId) {

    const modal =
        getElement(modalId);

    if (!modal) {
        return;
    }

    modal.classList.add(
        "show"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

}


/**
 * Close a modal.
 */
function closeModal(modalId) {

    const modal =
        getElement(modalId);

    if (!modal) {
        return;
    }

    modal.classList.remove(
        "show"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

}


/* ============================================================
   EMAIL VALIDATION
   ============================================================ */

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
    );

}


/* ============================================================
   PASSWORD VALIDATION
   ============================================================ */

function validatePassword(password) {

    return {

        length:
            password.length >= 8,

        uppercase:
            /[A-Z]/.test(
                password
            ),

        lowercase:
            /[a-z]/.test(
                password
            ),

        number:
            /[0-9]/.test(
                password
            ),

        special:
            /[^A-Za-z0-9]/.test(
                password
            )

    };

}


/**
 * Check if password satisfies all requirements.
 */
function isStrongPassword(password) {

    const result =
        validatePassword(
            password
        );

    return (
        result.length &&
        result.uppercase &&
        result.lowercase &&
        result.number &&
        result.special
    );

}


/* ============================================================
   PASSWORD SHOW / HIDE
   ============================================================ */

function togglePassword(
    inputId,
    button
) {

    const input =
        getElement(
            inputId
        );

    if (!input) {
        return;
    }


    if (
        input.type ===
        "password"
    ) {

        input.type =
            "text";


        if (button) {

            button.setAttribute(
                "aria-label",
                "Hide password"
            );

        }

    } else {

        input.type =
            "password";


        if (button) {

            button.setAttribute(
                "aria-label",
                "Show password"
            );

        }

    }

}


/* ============================================================
   LOGIN PASSWORD
   ============================================================ */

function toggleLoginPassword() {

    const password =
        getElement(
            "loginPassword"
        );


    const button =
        document.querySelector(
            ".password-toggle"
        );


    if (!password) {
        return;
    }


    if (
        password.type ===
        "password"
    ) {

        password.type =
            "text";


        if (button) {

            button.setAttribute(
                "aria-label",
                "Hide password"
            );

        }

    } else {

        password.type =
            "password";


        if (button) {

            button.setAttribute(
                "aria-label",
                "Show password"
            );

        }

    }

}


/* ============================================================
   REGISTRATION PASSWORD
   ============================================================ */

function toggleSignupPassword(
    inputId,
    button
) {

    togglePassword(
        inputId,
        button
    );

}


/* ============================================================
   PASSWORD REQUIREMENTS
   ============================================================ */

function updatePasswordRequirement(
    elementId,
    passed,
    text
) {

    const element =
        getElement(
            elementId
        );


    if (!element) {
        return;
    }


    element.textContent =
        (
            passed
                ? "✓ "
                : "○ "
        ) +
        text;


    element.classList.toggle(
        "requirement-passed",
        passed
    );

}


/**
 * Update all password requirement indicators.
 */
function updatePasswordRequirements(
    password
) {

    const result =
        validatePassword(
            password
        );


    updatePasswordRequirement(
        "lengthRequirement",
        result.length,
        "8 or more characters"
    );


    updatePasswordRequirement(
        "uppercaseRequirement",
        result.uppercase,
        "At least one uppercase letter"
    );


    updatePasswordRequirement(
        "lowercaseRequirement",
        result.lowercase,
        "At least one lowercase letter"
    );


    updatePasswordRequirement(
        "numberRequirement",
        result.number,
        "At least one number"
    );


    updatePasswordRequirement(
        "specialRequirement",
        result.special,
        "At least one special character"
    );

}


/* ============================================================
   EMAIL MASKING
   ============================================================ */

function maskEmail(email) {

    if (!email) {

        return (
            "your email address"
        );

    }


    const parts =
        email.split(
            "@"
        );


    if (
        parts.length !== 2
    ) {

        return email;

    }


    const username =
        parts[0];


    const domain =
        parts[1];


    let maskedUsername;


    if (
        username.length <= 2
    ) {

        maskedUsername =
            username.charAt(
                0
            ) +
            "*".repeat(
                Math.max(
                    username.length - 1,
                    1
                )
            );

    } else {

        maskedUsername =
            username.substring(
                0,
                2
            ) +
            "*".repeat(
                Math.max(
                    username.length - 2,
                    2
                )
            );

    }


    return (
        maskedUsername +
        "@" +
        domain
    );

}


/* ============================================================
   ROLE FORMATTING
   ============================================================ */

function formatRole(role) {

    const roleNames = {

        "student":
            "Student",

        "faculty":
            "Faculty",

        "department-head":
            "Department Head",

        "admin-security":
            "Admin & Security"

    };


    return (
        roleNames[role] ||
        role ||
        "User"
    );

}


/* ============================================================
   ROLE VALIDATION
   ============================================================ */

function isValidRole(role) {

    const validRoles = [

        "student",

        "faculty",

        "department-head",

        "admin-security"

    ];


    return validRoles.includes(
        role
    );

}


/* ============================================================
   SOCIAL LOGIN / SIGNUP
   ============================================================ */

function socialLogin(provider) {

    /*
     * SOCIAL LOGIN FLOW
     *
     * Google
     * -> verification-gmail-login.html
     *
     * Microsoft
     * -> verification-ms-login.html
     *
     * Keep the selected account role and mark this
     * verification flow specifically as LOGIN.
     */

    const params =
        new URLSearchParams(
            window.location.search
        );


    let role =
        params.get(
            "role"
        ) ||
        getSelectedRole() ||
        "student";


    if (
        !isValidRole(
            role
        )
    ) {

        role =
            "student";

    }


    /*
     * Keep role information synchronized for
     * the verification and success pages.
     */
    sessionStorage.setItem(
        "verificationRole",
        role
    );


    saveSelectedRole(
        role
    );


    sessionStorage.setItem(
        "verificationPurpose",
        "login"
    );


    sessionStorage.setItem(
        "verificationType",
        "login"
    );


    /*
     * GOOGLE / GMAIL LOGIN
     */
    if (
        provider ===
        "Google"
    ) {

        sessionStorage.setItem(
            "verificationProvider",
            "google"
        );


        window.location.href =
            "verification-gmail-login.html";


        return;

    }


    /*
     * MICROSOFT LOGIN
     */
    if (
        provider ===
        "Microsoft"
    ) {

        sessionStorage.setItem(
            "verificationProvider",
            "microsoft"
        );


        window.location.href =
            "verification-ms-login.html";


        return;

    }


    /*
     * Fallback for an unsupported provider.
     */
    showGenericModal(

        "Sign in unavailable",

        "Please select Google or Microsoft to continue.",

        "!"

    );

}


function socialSignup(provider) {

    showGenericModal(

        "Coming soon",

        provider +
        " registration will be available once the authentication service is connected.",

        "!"

    );

}


/* ============================================================
   GENERIC MODAL
   ============================================================ */

function showGenericModal(
    title,
    message,
    icon = "!"
) {


    /* --------------------------------------------------------
       LOGIN MODAL
       -------------------------------------------------------- */

    const loginModal =
        getElement(
            "loginMessageModal"
        );


    if (loginModal) {

        const titleElement =
            getElement(
                "loginModalTitle"
            );


        const messageElement =
            getElement(
                "loginModalMessage"
            );


        const iconElement =
            getElement(
                "loginModalIcon"
            );


        if (titleElement) {

            titleElement.textContent =
                title;

        }


        if (messageElement) {

            messageElement.textContent =
                message;

        }


        if (iconElement) {

            iconElement.textContent =
                icon;

        }


        openModal(
            "loginMessageModal"
        );


        return;

    }



    /* --------------------------------------------------------
       VERIFICATION MODAL
       -------------------------------------------------------- */

    const verificationModal =
        getElement(
            "verificationModal"
        );


    if (verificationModal) {

        const titleElement =
            getElement(
                "verificationModalTitle"
            );


        const messageElement =
            getElement(
                "verificationModalMessage"
            );


        const iconElement =
            getElement(
                "verificationModalIcon"
            );


        if (titleElement) {

            titleElement.textContent =
                title;

        }


        if (messageElement) {

            messageElement.textContent =
                message;

        }


        if (iconElement) {

            iconElement.textContent =
                icon;

        }


        openModal(
            "verificationModal"
        );


        return;

    }



    /* --------------------------------------------------------
       TERMS MODAL
       -------------------------------------------------------- */

    const termsModal =
        getElement(
            "termsModal"
        );


    if (termsModal) {

        const titleElement =
            termsModal.querySelector(
                "h2"
            );


        const paragraph =
            termsModal.querySelector(
                "p"
            );


        if (titleElement) {

            titleElement.textContent =
                title;

        }


        if (paragraph) {

            paragraph.textContent =
                message;

        }


        openModal(
            "termsModal"
        );

    }

}


/* ============================================================
   LOGIN MODAL
   ============================================================ */

function showLoginModal(
    title,
    message,
    icon = "!"
) {

    const modal =
        getElement(
            "loginMessageModal"
        );


    if (!modal) {
        return;
    }


    const titleElement =
        getElement(
            "loginModalTitle"
        );


    const messageElement =
        getElement(
            "loginModalMessage"
        );


    const iconElement =
        getElement(
            "loginModalIcon"
        );


    if (titleElement) {

        titleElement.textContent =
            title;

    }


    if (messageElement) {

        messageElement.textContent =
            message;

    }


    if (iconElement) {

        iconElement.textContent =
            icon;

    }


    openModal(
        "loginMessageModal"
    );

}


function closeLoginModal() {

    closeModal(
        "loginMessageModal"
    );

}


/* ============================================================
   VERIFICATION MODAL
   ============================================================ */

function showVerificationModal(
    title,
    message,
    icon = "!"
) {

    const modal =
        getElement(
            "verificationModal"
        );


    if (!modal) {

        showGenericModal(
            title,
            message,
            icon
        );

        return;

    }


    const titleElement =
        getElement(
            "verificationModalTitle"
        );


    const messageElement =
        getElement(
            "verificationModalMessage"
        );


    const iconElement =
        getElement(
            "verificationModalIcon"
        );


    if (titleElement) {

        titleElement.textContent =
            title;

    }


    if (messageElement) {

        messageElement.textContent =
            message;

    }


    if (iconElement) {

        iconElement.textContent =
            icon;

    }


    openModal(
        "verificationModal"
    );

}


function closeVerificationModal() {

    closeModal(
        "verificationModal"
    );

}


/* ============================================================
   HEADER MESSAGE
   ============================================================ */

function showHeaderMessage(section) {

    showGenericModal(

        section,

        section +
        " options will be available once this section is connected.",

        "!"

    );

}


/* ============================================================
   FORGOT PASSWORD
   ============================================================ */

function handleForgotPassword(event) {

    if (event) {

        event.preventDefault();

    }


    showLoginModal(

        "Forgot Password",

        "Password recovery will be available once the account security system is connected.",

        "?"

    );

}


/* ============================================================
   TERMS AND CONDITIONS
   ============================================================ */

function showTerms(event) {

    if (event) {

        event.preventDefault();

    }


    const modal =
        getElement(
            "termsModal"
        );


    if (!modal) {
        return;
    }


    const title =
        modal.querySelector(
            "h2"
        );


    const paragraph =
        modal.querySelector(
            "p"
        );


    if (title) {

        title.textContent =
            "Terms and Conditions";

    }


    if (paragraph) {

        paragraph.textContent =
            "By creating an EduMetrics account, you agree to follow the rules and policies established for the system. Your account information should be accurate and kept secure.";

    }


    openModal(
        "termsModal"
    );

}


function closeTerms() {

    closeModal(
        "termsModal"
    );

}


function acceptTerms() {

    const terms =
        getElement(
            "termsAgreement"
        );


    if (terms) {

        terms.checked =
            true;

    }


    closeTerms();

}


/* ============================================================
   OTP HELPERS
   ============================================================ */

/**
 * Get all OTP inputs on the current page.
 */
function getOTPInputs() {

    return document.querySelectorAll(
        ".otp-input"
    );

}


/**
 * Get complete OTP.
 */
function getOTP() {

    const inputs =
        getOTPInputs();


    return Array
        .from(
            inputs
        )
        .map(
            function(input) {

                return input.value;

            }
        )
        .join("");

}


/**
 * Clear OTP fields.
 */
function clearOTP() {

    const inputs =
        getOTPInputs();


    inputs.forEach(
        function(input) {

            input.value =
                "";


            input.classList.remove(
                "input-error"
            );

        }
    );


    if (
        inputs.length > 0
    ) {

        inputs[0].focus();

    }

}


/**
 * Show OTP error.
 */
function showOTPError(message) {

    const error =
        getElement(
            "otpError"
        );


    if (error) {

        error.textContent =
            message;

    }


    const inputs =
        getOTPInputs();


    inputs.forEach(
        function(input) {

            input.classList.add(
                "input-error"
            );

        }
    );

}


/**
 * Clear OTP error.
 */
function clearOTPError() {

    const error =
        getElement(
            "otpError"
        );


    if (error) {

        error.textContent =
            "";

    }


    const inputs =
        getOTPInputs();


    inputs.forEach(
        function(input) {

            input.classList.remove(
                "input-error"
            );

        }
    );

}


/* ============================================================
   OTP INPUT BEHAVIOR
   ============================================================ */

function initializeOTPInputs() {

    const inputs =
        getOTPInputs();


    if (!inputs.length) {
        return;
    }


    inputs.forEach(
        function(
            input,
            index
        ) {


            /* ------------------------------------------------
               PREVENT DUPLICATE INITIALIZATION
               ------------------------------------------------ */

            if (
                input.dataset.otpInitialized ===
                "true"
            ) {

                return;

            }


            input.dataset.otpInitialized =
                "true";



            /* ------------------------------------------------
               INPUT
               ------------------------------------------------ */

            input.addEventListener(
                "input",
                function(event) {

                    event.target.value =
                        event.target.value
                            .replace(
                                /[^0-9]/g,
                                ""
                            )
                            .slice(
                                0,
                                1
                            );


                    if (
                        event.target.value &&
                        index <
                            inputs.length - 1
                    ) {

                        inputs[
                            index + 1
                        ].focus();

                    }


                    clearOTPError();

                }
            );



            /* ------------------------------------------------
               KEYBOARD
               ------------------------------------------------ */

            input.addEventListener(
                "keydown",
                function(event) {


                    if (
                        event.key ===
                        "Backspace"
                    ) {

                        if (
                            !input.value &&
                            index > 0
                        ) {

                            inputs[
                                index - 1
                            ].value =
                                "";


                            inputs[
                                index - 1
                            ].focus();

                        }

                    }


                    if (
                        event.key ===
                        "ArrowLeft" &&
                        index > 0
                    ) {

                        event.preventDefault();


                        inputs[
                            index - 1
                        ].focus();

                    }


                    if (
                        event.key ===
                        "ArrowRight" &&
                        index <
                            inputs.length - 1
                    ) {

                        event.preventDefault();


                        inputs[
                            index + 1
                        ].focus();

                    }


                    if (
                        event.key ===
                        "Enter"
                    ) {

                        const verifyButton =
                            getElement(
                                "verifyButton"
                            );


                        if (verifyButton) {

                            verifyButton.click();

                        }

                    }

                }
            );



            /* ------------------------------------------------
               PASTE
               ------------------------------------------------ */

            input.addEventListener(
                "paste",
                function(event) {

                    event.preventDefault();


                    const pasted =
                        (
                            event.clipboardData ||
                            window.clipboardData
                        )
                        .getData(
                            "text"
                        )
                        .replace(
                            /\D/g,
                            ""
                        )
                        .substring(
                            0,
                            6
                        );


                    if (!pasted) {
                        return;
                    }


                    pasted
                        .split("")
                        .forEach(
                            function(
                                digit,
                                digitIndex
                            ) {

                                if (
                                    inputs[
                                        digitIndex
                                    ]
                                ) {

                                    inputs[
                                        digitIndex
                                    ].value =
                                        digit;

                                }

                            }
                        );


                    const focusIndex =
                        Math.min(
                            pasted.length,
                            inputs.length
                        ) - 1;


                    if (
                        focusIndex >= 0
                    ) {

                        inputs[
                            focusIndex
                        ].focus();

                    }


                    clearOTPError();

                }
            );

        }
    );


    if (
        inputs.length > 0
    ) {

        inputs[0].focus();

    }

}


/* ============================================================
   OTP RESEND TIMER
   ============================================================ */

let eduMetricsCountdownInterval =
    null;


function startResendCountdown(
    seconds = 30
) {

    const resendButton =
        getElement(
            "resendButton"
        );


    const resendTimer =
        getElement(
            "resendTimer"
        );


    if (!resendButton) {
        return;
    }


    clearInterval(
        eduMetricsCountdownInterval
    );


    let remaining =
        seconds;


    resendButton.disabled =
        true;


    if (resendTimer) {

        resendTimer.innerHTML =
            "Resend available in " +
            "<strong id=\"countdown\">" +
            remaining +
            "</strong>" +
            " seconds";

    }


    eduMetricsCountdownInterval =
        setInterval(
            function() {

                remaining--;


                const countdown =
                    getElement(
                        "countdown"
                    );


                if (countdown) {

                    countdown.textContent =
                        Math.max(
                            remaining,
                            0
                        );

                }


                if (
                    remaining <= 0
                ) {

                    clearInterval(
                        eduMetricsCountdownInterval
                    );


                    eduMetricsCountdownInterval =
                        null;


                    resendButton.disabled =
                        false;


                    if (resendTimer) {

                        resendTimer.innerHTML =
                            "<strong>You can now resend the code.</strong>";
                        resendTimer.style.setProperty(
                            "font-size",
                            "18px",
                            "important"
                        );

                        resendTimer.style.fontWeight =
                            "600";
                    }

                }

            },
            1000
        );

}


/* ============================================================
   VERIFY LOGIN CODE
   ============================================================ */

function verifyCode() {

    clearOTPError();


    const code =
        getOTP();


    if (
        code.length !== 6
    ) {

        showOTPError(
            "Please enter the complete 6-digit verification code."
        );

        return;

    }


    if (
        !/^\d{6}$/.test(
            code
        )
    ) {

        showOTPError(
            "Verification code must contain numbers only."
        );

        return;

    }


    /*
     * PROTOTYPE VERIFICATION CODE
     *
     * Temporary code:
     * 123456
     *
     * Replace this later with backend verification.
     */
    if (
        code !==
        "123456"
    ) {

        showOTPError(
            "Invalid verification code. Please try again."
        );

        return;

    }


    const verificationEmail =
        sessionStorage.getItem(
            "verificationEmail"
        ) || "";


    const verificationRole =
        sessionStorage.getItem(
            "verificationRole"
        ) ||
        getSelectedRole() ||
        "student";


    sessionStorage.setItem(
        "verificationCompleted",
        "true"
    );


    sessionStorage.setItem(
        "verificationType",
        "login"
    );


    sessionStorage.setItem(
        "verifiedEmail",
        verificationEmail
    );


    sessionStorage.setItem(
        "verifiedRole",
        verificationRole
    );


    window.location.href =
        "verification-success.html";

}


/* ============================================================
   RESEND LOGIN VERIFICATION CODE
   ============================================================ */

function resendCode() {

    const resendButton =
        getElement(
            "resendButton"
        );


    if (
        !resendButton ||
        resendButton.disabled
    ) {

        return;

    }


    showVerificationModal(

        "Code Resent",

        "A new verification code has been requested. For this prototype, use 123456.",

        "✓"

    );


    clearOTP();


    startResendCountdown(
        30
    );

}


/* ============================================================
   SESSION STORAGE HELPERS
   ============================================================ */

function saveVerificationData(
    email,
    role,
    purpose
) {

    sessionStorage.setItem(
        "verificationEmail",
        email || ""
    );


    sessionStorage.setItem(
        "verificationRole",
        role || ""
    );


    sessionStorage.setItem(
        "verificationPurpose",
        purpose || ""
    );

}


/**
 * Clear verification-related session data.
 */
function clearVerificationData() {

    const keys = [

        "verificationEmail",

        "verificationRole",

        "verificationPurpose",

        "verificationProvider",

        "verificationCompleted",

        "verificationType",

        "verifiedEmail",

        "verifiedRole",

        "accountVerified"

    ];


    keys.forEach(
        function(key) {

            sessionStorage.removeItem(
                key
            );

        }
    );

}


/* ============================================================
   ROLE STORAGE
   ============================================================ */

function saveSelectedRole(role) {

    if (
        !role
    ) {

        return;

    }


    sessionStorage.setItem(
        "selectedRole",
        role
    );

}


function getSelectedRole() {

    return sessionStorage.getItem(
        "selectedRole"
    );

}


/**
 * Restore saved role into a select element.
 */
function restoreSelectedRole(
    selectId
) {

    const select =
        getElement(
            selectId
        );


    if (!select) {
        return;
    }


    const savedRole =
        getSelectedRole();


    if (!savedRole) {
        return;
    }


    const option =
        Array.from(
            select.options
        )
        .find(
            function(item) {

                return (
                    item.value ===
                    savedRole
                );

            }
        );


    if (option) {

        select.value =
            savedRole;

    }

}


/* ============================================================
   INFO MODAL - WEBSITE PAGE
   ============================================================ */

function openInfoModal(
    title,
    text,
    icon = "◇"
) {

    const modal =
        getElement(
            "infoModal"
        );


    if (!modal) {
        return;
    }


    const modalTitle =
        getElement(
            "modalTitle"
        );


    const modalText =
        getElement(
            "modalText"
        );


    const modalIcon =
        getElement(
            "modalIcon"
        );


    if (modalTitle) {

        modalTitle.textContent =
            title;

    }


    if (modalText) {

        modalText.textContent =
            text;

    }


    if (modalIcon) {

        modalIcon.textContent =
            icon;

    }


    openModal(
        "infoModal"
    );

}


function closeInfoModal() {

    closeModal(
        "infoModal"
    );

}


/* ============================================================
   WEBSITE SUPPORT
   ============================================================ */

function showSupport() {

    openInfoModal(

        "Support",

        "For assistance with EduMetrics, please contact your system administrator.",

        "?"

    );

}


/* ============================================================
   WEBSITE SETTINGS
   ============================================================ */

function showSettings() {

    openInfoModal(

        "Settings",

        "System settings will be available after you log in.",

        "⚙"

    );

}


/* ============================================================
   WEBSITE INFORMATION CARDS
   ============================================================ */

function handleInfoClick(
    event,
    type
) {

    if (event) {

        event.preventDefault();

    }


    const content = {

        platform: {

            title:
                "Platform",

            text:
                "Explore the EduMetrics academic assessment and grading platform.",

            icon:
                "▣"

        },


        products: {

            title:
                "Products",

            text:
                "Explore tools for assessments, outcomes, and CQI analytics.",

            icon:
                "◇"

        },


        resources: {

            title:
                "Resources",

            text:
                "Access guides, manuals, and other EduMetrics resource materials.",

            icon:
                "▱"

        },


        about: {

            title:
                "About us",

            text:
                "Learn about the vision, mission, and commitment behind EduMetrics.",

            icon:
                "♧"

        }

    };


    const selected =
        content[type];


    if (!selected) {
        return;
    }


    openInfoModal(
        selected.title,
        selected.text,
        selected.icon
    );

}


/* ============================================================
   REGISTRATION BACK BUTTON
   ============================================================ */

/**
 * Registration Back button returns to the login page
 * using the exact same selected role.
 */
function initializeRegistrationBackButton() {

    const backButton =
        document.querySelector(
            ".registration-back"
        );


    if (!backButton) {
        return;
    }


    const params =
        new URLSearchParams(
            window.location.search
        );


    let role =
        params.get(
            "role"
        ) ||
        getSelectedRole() ||
        "student";


    if (
        !isValidRole(
            role
        )
    ) {

        role =
            "student";

    }


    saveSelectedRole(
        role
    );


    backButton.href =
        "login page.html?role=" +
        encodeURIComponent(
            role
        );

}


/* ============================================================
   LOGIN ROLE FROM URL
   ============================================================ */

/**
 * When login page contains:
 *
 * login page.html?role=faculty
 *
 * the URL role gets priority.
 */
function initializeLoginRoleFromURL() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    const urlRole =
        params.get(
            "role"
        );


    if (
        !urlRole ||
        !isValidRole(
            urlRole
        )
    ) {

        return;

    }


    /*
     * Save URL role first so it becomes
     * the active selected role.
     */
    saveSelectedRole(
        urlRole
    );


    const loginRole =
        getElement(
            "loginRole"
        );


    if (loginRole) {

        const option =
            Array.from(
                loginRole.options
            )
            .find(
                function(item) {

                    return (
                        item.value ===
                        urlRole
                    );

                }
            );


        if (option) {

            loginRole.value =
                urlRole;

        }

    }


    /*
     * Support login pages that show role
     * through a text label instead of a select.
     */
    const loginRoleLabel =
        getElement(
            "loginRoleLabel"
        );


    if (loginRoleLabel) {

        loginRoleLabel.textContent =
            formatRole(
                urlRole
            );

    }

}


/* ============================================================
   LOGIN VERIFICATION PAGE
   ============================================================ */

/**
 * Initialize verification-login.html.
 *
 * Student Login
 * -> Student Verification
 *
 * Faculty Login
 * -> Faculty Verification
 *
 * Department Head Login
 * -> Department Head Verification
 *
 * Admin & Security Login
 * -> Admin & Security Verification
 */
function initializeLoginVerificationPage() {


    /*
     * Current HTML:
     * verificationRoleLabel
     *
     * Older fallback:
     * verificationHeaderRole
     */
    const roleLabel =
        getElement(
            "verificationRoleLabel"
        ) ||
        getElement(
            "verificationHeaderRole"
        );


    const emailLabel =
        getElement(
            "verificationEmail"
        );


    const verificationBackButton =
        getElement(
            "verificationBackButton"
        );


    const backToLoginLink =
        getElement(
            "backToLoginLink"
        );


    /*
     * If none of these exist,
     * this is not verification-login.html.
     */
    if (
        !roleLabel &&
        !emailLabel &&
        !verificationBackButton &&
        !backToLoginLink
    ) {

        return;

    }


    /*
     * Verification role has first priority.
     */
    let role =
        sessionStorage.getItem(
            "verificationRole"
        ) ||
        getSelectedRole() ||
        "student";


    if (
        !isValidRole(
            role
        )
    ) {

        role =
            "student";

    }


    /*
     * Keep both role values synchronized.
     */
    sessionStorage.setItem(
        "verificationRole",
        role
    );


    saveSelectedRole(
        role
    );


    /*
     * HEADER ROLE
     */
    if (roleLabel) {

        roleLabel.textContent =
            formatRole(
                role
            );

    }


    /*
     * VERIFICATION EMAIL
     */
    const email =
        sessionStorage.getItem(
            "verificationEmail"
        ) || "";


    if (emailLabel) {

        emailLabel.textContent =
            email ||
            "your email address";

    }


    /*
     * BACK URL
     */
    const loginURL =
        "login page.html?role=" +
        encodeURIComponent(
            role
        );


    if (
        verificationBackButton
    ) {

        verificationBackButton.href =
            loginURL;

    }


    if (
        backToLoginLink
    ) {

        backToLoginLink.href =
            loginURL;

    }


    /*
     * PAGE TITLE
     */
    document.title =
        "EduMetrics | " +
        formatRole(
            role
        ) +
        " Verification";


    /*
     * START RESEND TIMER
     */
    if (
        getElement(
            "resendButton"
        )
    ) {

        startResendCountdown(
            30
        );

    }

}


/* ============================================================
   LOGIN PAGE ROLE CHANGE
   ============================================================ */

function initializeLoginRoleChange() {

    const loginRole =
        getElement(
            "loginRole"
        );


    if (!loginRole) {
        return;
    }


    if (
        loginRole.dataset.roleInitialized ===
        "true"
    ) {

        return;

    }


    loginRole.dataset.roleInitialized =
        "true";


    loginRole.addEventListener(
        "change",
        function() {

            saveSelectedRole(
                this.value
            );


            const loginRoleLabel =
                getElement(
                    "loginRoleLabel"
                );


            if (loginRoleLabel) {

                loginRoleLabel.textContent =
                    formatRole(
                        this.value
                    );

            }

        }
    );

}


/* ============================================================
   SIGNUP ROLE CHANGE
   ============================================================ */

function initializeSignupRoleChange() {

    const signupRole =
        getElement(
            "signupRole"
        );


    if (!signupRole) {
        return;
    }


    if (
        signupRole.dataset.roleInitialized ===
        "true"
    ) {

        return;

    }


    signupRole.dataset.roleInitialized =
        "true";


    signupRole.addEventListener(
        "change",
        function() {

            saveSelectedRole(
                this.value
            );

        }
    );

}


/* ============================================================
   REGISTRATION PASSWORD REQUIREMENTS
   ============================================================ */

function initializeSignupPasswordRequirements() {

    const signupPassword =
        getElement(
            "signupPassword"
        );


    if (!signupPassword) {
        return;
    }


    if (
        signupPassword.dataset.requirementsInitialized ===
        "true"
    ) {

        return;

    }


    signupPassword.dataset.requirementsInitialized =
        "true";


    signupPassword.addEventListener(
        "input",
        function() {

            updatePasswordRequirements(
                this.value
            );

        }
    );


    updatePasswordRequirements(
        signupPassword.value
    );

}


/* ============================================================
   GENERIC CLOSE MODAL EVENTS
   ============================================================ */

document.addEventListener(
    "click",
    function(event) {


        /* ----------------------------------------------------
           INFO MODAL
           ---------------------------------------------------- */

        const infoModal =
            getElement(
                "infoModal"
            );


        if (
            infoModal &&
            event.target ===
                infoModal
        ) {

            closeInfoModal();

        }



        /* ----------------------------------------------------
           LOGIN MODAL
           ---------------------------------------------------- */

        const loginModal =
            getElement(
                "loginMessageModal"
            );


        if (
            loginModal &&
            event.target ===
                loginModal
        ) {

            closeLoginModal();

        }



        /* ----------------------------------------------------
           VERIFICATION MODAL
           ---------------------------------------------------- */

        const verificationModal =
            getElement(
                "verificationModal"
            );


        if (
            verificationModal &&
            event.target ===
                verificationModal
        ) {

            closeVerificationModal();

        }



        /* ----------------------------------------------------
           TERMS MODAL
           ---------------------------------------------------- */

        const termsModal =
            getElement(
                "termsModal"
            );


        if (
            termsModal &&
            event.target ===
                termsModal
        ) {

            closeTerms();

        }

    }
);


/* ============================================================
   ESCAPE KEY
   ============================================================ */

document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key !==
            "Escape"
        ) {

            return;

        }


        closeInfoModal();


        closeLoginModal();


        closeVerificationModal();


        closeTerms();

    }
);


/* ============================================================
   INITIALIZE COMMON FEATURES
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    function() {


        /* ====================================================
           LOGIN ROLE FROM URL
           ==================================================== */

        initializeLoginRoleFromURL();



        /* ====================================================
           REGISTRATION BACK BUTTON
           ==================================================== */

        initializeRegistrationBackButton();



        /* ====================================================
           RESTORE LOGIN ROLE
           ==================================================== */

        restoreSelectedRole(
            "loginRole"
        );



        /*
         * URL role must remain the priority after
         * restoring the saved role.
         */
        initializeLoginRoleFromURL();



        /* ====================================================
           RESTORE SIGNUP ROLE
           ==================================================== */

        restoreSelectedRole(
            "signupRole"
        );



        /* ====================================================
           LOGIN ROLE CHANGE
           ==================================================== */

        initializeLoginRoleChange();



        /* ====================================================
           SIGNUP ROLE CHANGE
           ==================================================== */

        initializeSignupRoleChange();



        /* ====================================================
           REGISTRATION PASSWORD REQUIREMENTS
           ==================================================== */

        initializeSignupPasswordRequirements();



        /* ====================================================
           LOGIN VERIFICATION PAGE
           ==================================================== */

        initializeLoginVerificationPage();



        /* ====================================================
           OTP INITIALIZATION
           ==================================================== */

        if (
            document.querySelector(
                ".otp-input"
            )
        ) {

            initializeOTPInputs();

        }

    }
);