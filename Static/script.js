/* EduMetrics - Academic Assessment & Grading System */

/**Get an element safely.*/
function getElement(id) {
    return document.getElementById(id);
}

/**Check whether an element exists.*/
function elementExists(id) {
    return getElement(id) !== null;
}

/**Open a modal.*/
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

/**Close a modal.*/
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

/* EMAIL VALIDATION*/
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
    );
}

/* PASSWORD VALIDATION*/
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


/**Check if password satisfies all requirements.*/
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


/* PASSWORD SHOW / HIDE*/
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

/* LOGIN PASSWORD*/
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


/* REGISTRATION PASSWORD*/
function toggleSignupPassword(
    inputId,
    button
) {
    togglePassword(
        inputId,
        button
    );
}

/* PASSWORD REQUIREMENTS*/
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

/**Update all password requirement indicators.*/
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

/* EMAIL MASKING*/
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


/* ROLE FORMATTING*/
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

/* ROLE VALIDATION*/
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

/* SOCIAL LOGIN / SIGNUP*/
function socialLogin(provider) {

    /*SOCIAL LOGIN FLOW*/
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

    /* GOOGLE / GMAIL LOGIN*/
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

    /*MICROSOFT LOGIN*/
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

    /*Fallback for an unsupported provider.*/
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

/* GENERIC MODAL*/
function showGenericModal(
    title,
    message,
    icon = "!"
) {

    /* LOGIN MODAL */
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


/* VERIFICATION MODAL */
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


/* TERMS MODAL */
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


/* LOGIN MODAL */
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


/* VERIFICATION MODAL*/
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

/* HEADER MESSAGE*/
function showHeaderMessage(section) {
    showGenericModal(
        section,
        section +
        " options will be available once this section is connected.",
        "!"
    );
}

/* FORGOT PASSWORD*/
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

/* TERMS AND CONDITIONS*/
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

/* OTP HELPERS*/
function getOtpInputs() {
    return Array.from(
        document.querySelectorAll(
            ".otp-input"
        )
    );
}

function clearOtpInputs() {

    const otpInputs =
        getOtpInputs();

    otpInputs.forEach(
        function (input) {

            input.value = "";

        }
    );

    if (otpInputs.length > 0) {
        otpInputs[0].focus();
    }
}

function getOtpValue() {

    const otpInputs =
        getOtpInputs();
    return otpInputs
        .map(
            function (input) {

                return input.value;

            }
        )
        .join("");
}

function setupOtpInputs() {

    const otpInputs =
        getOtpInputs();

    if (
        otpInputs.length === 0
    ) {
        return;
    }

    otpInputs.forEach(
        function (
            input,
            index
        ) {
            input.addEventListener(
                "input",
                function (event) {

                    let value =
                        event.target.value;

                    value =
                        value.replace(
                            /\D/g,
                            ""
                        );
                    if (
                        value.length > 1
                    ) {
                        value =
                            value.slice(
                                -1
                            );
                    }

                    event.target.value =
                        value;

                    if (
                        value &&
                        index <
                            otpInputs.length - 1
                    ) {
                        otpInputs[
                            index + 1
                        ].focus();

                    }
                }
            );

            input.addEventListener(
                "keydown",
                function (event) {

                    if (
                        event.key ===
                            "Backspace" &&
                        input.value === "" &&
                        index > 0
                    ) {

                        otpInputs[
                            index - 1
                        ].focus();
                    }

                    if (
                        event.key ===
                            "ArrowLeft" &&
                        index > 0
                    ) {

                        event.preventDefault();

                        otpInputs[
                            index - 1
                        ].focus();

                    }

                    if (
                        event.key ===
                            "ArrowRight" &&
                        index <
                            otpInputs.length - 1
                    ) {

                        event.preventDefault();

                        otpInputs[
                            index + 1
                        ].focus();
                    }
                }
            );

            input.addEventListener(
                "paste",
                function (event) {

                    event.preventDefault();
                    const pastedText =
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
                            );

                    if (!pastedText) {

                        return;

                    }

                    const digits =
                        pastedText
                            .slice(
                                0,
                                otpInputs.length
                            )
                            .split("");

                    digits.forEach(
                        function (
                            digit,
                            digitIndex
                        ) {

                            if (
                                otpInputs[
                                    digitIndex
                                ]
                            ) {
                                otpInputs[
                                    digitIndex
                                ].value =
                                    digit;
                            }
                        }
                    );

                    const focusIndex =
                        Math.min(
                            digits.length,
                            otpInputs.length
                        ) - 1;

                    if (
                        focusIndex >= 0
                    ) {
                        otpInputs[
                            focusIndex
                        ].focus();
                    }
                }
            );
        }
    );
}

/* VERIFICATION CODE*/
function generateVerificationCode() {

    return String(
        Math.floor(
            100000 +
            Math.random() *
                900000
        )
    );
}

function saveVerificationCode(code) {

    sessionStorage.setItem(
        "verificationCode",
        code
    );

    sessionStorage.setItem(
        "verificationCodeCreatedAt",
        String(
            Date.now()
        )
    );
}

function getVerificationCode() {
    return (
        sessionStorage.getItem(
            "verificationCode"
        ) || ""
    );
}

function createVerificationCode() {
    const code =
        generateVerificationCode();
    saveVerificationCode(
        code
    );
    return code;
}

/* VERIFICATION TIMER*/
let verificationTimerInterval =
    null;

function formatVerificationTime(
    seconds
) {
    const minutes =
        Math.floor(
            seconds / 60
        );

    const remainingSeconds =
        seconds % 60;
    return (
        String(minutes).padStart(
            2,
            "0"
        ) +
        ":" +
        String(
            remainingSeconds
        ).padStart(
            2,
            "0"
        )
    );
}

function startVerificationTimer(
    duration = 60
) {
    const timerElement =
        getElement(
            "verificationTimer"
        );
    const resendButton =
        getElement(
            "resendCodeButton"
        );
    if (
        verificationTimerInterval
    ) {
        clearInterval(
            verificationTimerInterval
        );
    }

    let remaining =
        duration;
    if (resendButton) {
        resendButton.disabled =
            true;
    }
    function updateTimer() {
        if (timerElement) {
            timerElement.textContent =
                formatVerificationTime(
                    remaining
                );
        }

        if (
            remaining <= 0
        ) {
            clearInterval(
                verificationTimerInterval
            );
            verificationTimerInterval =
                null;

            if (resendButton) {
                resendButton.disabled =
                    false;
            }
            return;
        }
        remaining -= 1;
    }
    updateTimer();
    verificationTimerInterval =
        setInterval(
            updateTimer,
            1000
        );
}

/* RESEND VERIFICATION CODE */
function resendVerificationCode(
    event
) {
    if (event) {
        event.preventDefault();

    }
    const newCode =
        createVerificationCode();
    clearOtpInputs();
    startVerificationTimer(
        60
    );
    console.log(
        "New verification code:",
        newCode
    );
    showVerificationModal(
        "Code Resent",
        "A new verification code has been sent.",
        "✓"
    );
}

/* OTP / VERIFICATION INITIALIZATION*/
document.addEventListener(
    "DOMContentLoaded",
    function () {
        setupOtpInputs();
    }
);

/* OTP RESEND TIMER*/
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

/* VERIFY LOGIN CODE*/
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
     PROTYPE VERIFICATION, PALITAN NA LANG*/
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

/* RESEND LOGIN VERIFICATION CODE */
function resendCode() {
    const resendButton =
        getElement(
            "resendButton"
        );

    if (
        !resendButton ||
        resendButton.disabled
    ) {return;}
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

/* SESSION STORAGE HELPERS */
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

/**Clear verification-related session data.*/
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

/* ROLE STORAGE*/
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

/**Restore saved role into a select element.*/
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

/* INFO MODAL - WEBSITE PAGE */
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

/* WEBSITE SUPPORT */
function showSupport() {
    openInfoModal(
        "Support",
        "For assistance with EduMetrics, please contact your system administrator.",
        "?"
    );
}

/* WEBSITE SETTINGS */

function showSettings() {
    openInfoModal(
        "Settings",
        "System settings will be available after you log in.",
        "⚙"
        );
}

/*WEBSITE INFORMATION CARDS*/
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

/* REGISTRATION BACK BUTTON*/
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

    if ( !isValidRole(
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

/* LOGIN ROLE FROM URL */
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

/* LOGIN VERIFICATION PAGE*/
function initializeLoginVerificationPage() {

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

    /*If none of these exist,
     this is not verification-login.html.*/
    if (
        !roleLabel &&
        !emailLabel &&
        !verificationBackButton &&
        !backToLoginLink
    ) {
        return;
    }

    /*Verification role has first priority.*/
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

    /*Keep both role values synchronized.*/
    sessionStorage.setItem(
        "verificationRole",
        role
    );
    saveSelectedRole(
        role
    );

    /*HEADER ROLE*/
    if (roleLabel) {
        roleLabel.textContent =
            formatRole(
                role
            );
    }

    /*VERIFICATION EMAIL */
    const email =
        sessionStorage.getItem(
            "verificationEmail"
        ) || "";

    if (emailLabel) {
        emailLabel.textContent =
            email ||
            "your email address";

    }

    /* BACK URL*/
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

    /* PAGE TITLE*/
    document.title =
        "EduMetrics | " +
        formatRole(
            role
        ) +
        " Verification";

    /*START RESEND TIMER*/
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

/* LOGIN PAGE ROLE CHANGE*/
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

/* SIGNUP ROLE CHANGE*/
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

/* REGISTRATION PASSWORD REQUIREMENTS*/
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

/* GENERIC CLOSE MODAL EVENTS */
document.addEventListener(
    "click",
    function(event) {

        /* INFO MODAL*/
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

        /* LOGIN MODAL*/
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

        /* VERIFICATION MODAL*/
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

        /* TERMS MODAL*/
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

/* ESCAPE KEY*/
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

/* INITIALIZE COMMON FEATURES*/
document.addEventListener(
    "DOMContentLoaded",
    function() {

        /* LOGIN ROLE FROM URL */
        initializeLoginRoleFromURL();

        /* REGISTRATION BACK BUTTON*/
        initializeRegistrationBackButton();

        /* RESTORE LOGIN ROLE */
        restoreSelectedRole(
            "loginRole"
        );
        initializeLoginRoleFromURL();

        /*  RESTORE SIGNUP ROLE */
        restoreSelectedRole(
            "signupRole"
        );

        /* LOGIN ROLE CHANGE*/
        initializeLoginRoleChange();

        /* SIGNUP ROLE CHANGE*/
        initializeSignupRoleChange();

        /* REGISTRATION PASSWORD REQUIREMENTS */
        initializeSignupPasswordRequirements();

        /* LOGIN VERIFICATION PAGE*/
        initializeLoginVerificationPage();

        /* OTP INITIALIZATION*/
        if (
            document.querySelector(
                ".otp-input"
            )
        ) {
            initializeOTPInputs();
        }
    }
);

/* SYLLABUS & OUTCOMES -STUDENT + FACULTY SHARED PAGE FUNCTIONS*/
/* DATE HELPER*/
function getFormattedDate() {
    return new Date().toLocaleDateString(
        "en-US",
        {
            month: "long",
            day: "numeric",
            year: "numeric"
        }
    );
}

/* FILE SIZE HELPER*/
function formatFileSize(bytes) {

    if (!bytes) {
        return "0 MB";
    }
    const mb =
        bytes /
        (1024 * 1024);

    return mb.toFixed(2) + " MB";
}

/* SAFE SHOW / HIDE HELPERS*/
function showElement(element) {
    if (!element) {
        return;
    }
    element.hidden = false;
}

function hideElement(element) {

    if (!element) {
        return;
    }
    element.hidden = true;
}

/* TABS-WORKS FOR STUDENT + FACULTY*/
function initializeSyllabusOutcomeTabs() {
    const tabs =
        document.querySelectorAll(
            ".sof-tab"
        );
    if (!tabs.length) {
        return;
    }

    const panels =
        document.querySelectorAll(
            ".sof-tab-panel"
        );

    tabs.forEach(
        function(tab) {
            if (
                tab.dataset.tabInitialized ===
                "true"
            ) {
                return;
            }
            tab.dataset.tabInitialized =
                "true";
            tab.addEventListener(
                "click",
                function() {
                    const targetId =
                        this.dataset.tab;
                    if (!targetId) {
                        return;
                    }

                    tabs.forEach(
                        function(item) {

                            item.classList.remove(
                                "active"
                            );
                        }
                    );

                    panels.forEach(
                        function(panel) {
                            panel.classList.remove(
                                "active"
                            );
                        }
                    );

                    this.classList.add(
                        "active"
                    );

                    const targetPanel =
                        document.getElementById(
                            targetId
                        );

                    if (targetPanel) {
                        targetPanel.classList.add(
                            "active"
                        );
                    }
                }
            );
        }
    );
}

/* COURSE SYLLABUS-FACULTY ONLY*/
function initializeFacultySyllabus() {

    const syllabusFile =
        document.getElementById(
            "syllabusFile"
        );

    const syllabusLastUpdated =
        document.getElementById(
            "syllabusLastUpdated"
        );

    const facultySyllabusEmpty =
        document.getElementById(
            "facultySyllabusEmpty"
        );

    const facultySyllabusFileRow =
        document.getElementById(
            "facultySyllabusFileRow"
        );

    const syllabusFileName =
        document.getElementById(
            "syllabusFileName"
        );

    const syllabusFileSize =
        document.getElementById(
            "syllabusFileSize"
        );

    const viewSyllabusButton =
        document.getElementById(
            "viewSyllabusButton"
        );

    const downloadSyllabusButton =
        document.getElementById(
            "downloadSyllabusButton"
        );

    const syllabusMoreButton =
        document.getElementById(
            "syllabusMoreButton"
        );

    const syllabusFileMenu =
        document.getElementById(
            "syllabusFileMenu"
        );

    const deleteSyllabusOption =
        document.getElementById(
            "deleteSyllabusOption"
        );

    if (!syllabusFile) {
        return;
    }
    /*Prevent duplicate initialization.*/
    if (
        syllabusFile.dataset.initialized ===
        "true"
    ) {
        return;
    }

    syllabusFile.dataset.initialized =
        "true";
    let currentSyllabusURL =
        null;

    /* CLOSE THREE-DOT MENU */
    function closeSyllabusMenu() {
        if (!syllabusFileMenu) {
            return;
        }

        syllabusFileMenu.hidden =
            true;

        if (syllabusMoreButton) {
            syllabusMoreButton.setAttribute(
                "aria-expanded",
                "false"
            );
        }
    }

    /* UPLOAD SYLLABUS*/
    syllabusFile.addEventListener(
        "change",
        function() {

            if (
                !this.files ||
                !this.files.length
            ) {
                return;
            }

            const selectedFile =
                this.files[0];
            const isPDF =
                selectedFile.type ===
                    "application/pdf" ||
                selectedFile.name
                    .toLowerCase()
                    .endsWith(".pdf");

            if (!isPDF) {
                alert(
                    "Please select a PDF file."
                );
                this.value = "";
                return;
            }

            if (currentSyllabusURL) {
                URL.revokeObjectURL(
                    currentSyllabusURL
                );
            }

            currentSyllabusURL =
                URL.createObjectURL(
                    selectedFile
                );

            if (syllabusFileName) {
                syllabusFileName.textContent =
                    selectedFile.name;
            }

            if (syllabusFileSize) {
                syllabusFileSize.textContent =
                    formatFileSize(
                        selectedFile.size
                    );
            }
            if (syllabusLastUpdated) {
                syllabusLastUpdated.textContent =
                    "Last Updated: " +
                    getFormattedDate();
            }
            hideElement(
                facultySyllabusEmpty
            );
            showElement(
                facultySyllabusFileRow
            );
            closeSyllabusMenu();
        }
    );

    /* VIEW SYLLABUS*/
    if (viewSyllabusButton) {
        viewSyllabusButton.addEventListener(
            "click",
            function() {
                if (!currentSyllabusURL) {
                    return;
                }
                window.open(
                    currentSyllabusURL,
                    "_blank"
                );
            }
        );
    }
    /* DOWNLOAD SYLLABUS*/
    if (downloadSyllabusButton) {
        downloadSyllabusButton.addEventListener(
            "click",
            function() {
                if (
                    !currentSyllabusURL ||
                    !syllabusFile.files ||
                    !syllabusFile.files.length
                ) {
                    return;
                }
                const downloadLink =
                    document.createElement(
                        "a"
                    );
                downloadLink.href =
                    currentSyllabusURL;
                downloadLink.download =
                    syllabusFile.files[0].name;
                document.body.appendChild(
                    downloadLink
                );
                downloadLink.click();
                downloadLink.remove();
            }
        );
    }

    /* THREE DOTS*/
    if (
        syllabusMoreButton &&
        syllabusFileMenu
    ) {
        syllabusMoreButton.addEventListener(
            "click",
            function(event) {
                event.preventDefault();
                event.stopPropagation();
                syllabusFileMenu.hidden =
                    !syllabusFileMenu.hidden;
                syllabusMoreButton.setAttribute(
                    "aria-expanded",
                    syllabusFileMenu.hidden
                        ? "false"
                        : "true"
                );
            }
        );
        syllabusFileMenu.addEventListener(
            "click",             function(event) {

                event.stopPropagation();
            }
        );
    }

    /* DELETE SYLLABUS */
    if (deleteSyllabusOption) {
        deleteSyllabusOption.addEventListener(
            "click",
            function() {
                closeSyllabusMenu();
                const confirmed =
                    window.confirm(
                        "Are you sure you want to delete this syllabus?"
                    );
                if (!confirmed) {
                    return;
                }
                if (currentSyllabusURL) {
                    URL.revokeObjectURL(
                        currentSyllabusURL
                    );
                    currentSyllabusURL =
                        null;
                }

                syllabusFile.value =
                    "";
                if (syllabusFileName) {
                    syllabusFileName.textContent =
                        "Course_Syllabus.pdf";
                }
                if (syllabusFileSize) {
                    syllabusFileSize.textContent =
                        "0 MB";
                }
                if (syllabusLastUpdated) {
                    syllabusLastUpdated.textContent =
                        "No syllabus uploaded";
                }
                hideElement(
                    facultySyllabusFileRow
                );
                showElement(
                    facultySyllabusEmpty
                );
            }
        );
    }

    /* CLICK OUTSIDE*/
    document.addEventListener(
        "click",
        function(event) {
            if (
                syllabusMoreButton &&
                syllabusMoreButton.contains(
                    event.target
                )
            ) {
                return;
            }

            if (
                syllabusFileMenu &&
                syllabusFileMenu.contains(
                    event.target
                )
            ) {
                return;
            }
            closeSyllabusMenu();
        }
    );

    /* ESC*/
    document.addEventListener(
        "keydown",
        function(event) {
            if (
                event.key ===
                "Escape"
            ) {
                closeSyllabusMenu();
            }
        }
    );
}

/* FACULTY — SYLLABUS & OUTCOMES*/
document.addEventListener("DOMContentLoaded", function () {
    initFacultySyllabusOutcomes();
});
function initFacultySyllabusOutcomes() {

    const page =
        document.querySelector(
            ".so-faculty-page"
        );

    if (!page) {
        return;
    }

    /* COMMON HELPERS*/
    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
    function openModal(modal) {
        if (!modal) {
            return;
        }
        modal.hidden = false;
        modal.removeAttribute(
            "hidden"
        );
        document.body.classList.add(
            "sof-modal-open"
        );
    }
    function closeModal(modal) {
        if (!modal) {
            return;
        }
        modal.hidden = true;
        modal.setAttribute(
            "hidden",
           ""
        );
        const stillOpen =
            document.querySelector(
                ".sof-outcome-modal:not([hidden]), " +
                ".sof-delete-modal:not([hidden])"
            );
        if (!stillOpen) {
            document.body.classList.remove(
                "sof-modal-open"
            );
        }
    }
    function formatFileSize(bytes) {
        if (!bytes) {
            return "0 MB";
        }
        const mb =
            bytes /
            (1024 * 1024);
        return (
            mb.toFixed(2) +
            " MB"
        );
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }
        const date =
            new Date(
                value + "T00:00:00"
            );
        return date.toLocaleDateString(
            "en-US",
            {
                month: "short",
                day: "numeric",
                year: "numeric"
            }
        );
    }

    function getTodayFormatted() {
        return new Date()
            .toLocaleDateString(
                "en-US",
                {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }
            );
    }

    /* TABS*/
    const tabs =
        document.querySelectorAll(
            ".sof-tab"
        );
    const tabPanels =
        document.querySelectorAll(
            ".sof-tab-panel"
        );
    tabs.forEach(
        function (tab) {
            tab.addEventListener(
                "click",
                function () {
                    const targetId =
                        this.dataset.tab;
                    if (!targetId) {
                        return;
                    }
                    tabs.forEach(
                        function (item) {
                            item.classList.remove(
                                "active"
                            );
                        }
                    );
                    tabPanels.forEach(
                        function (panel) {
                            panel.classList.remove(
                                "active"
                            );
                        }
                    );
                    this.classList.add(
                        "active"
                    );
                    const target =
                        document.getElementById(
                            targetId
                        );
                    if (target) {

                        target.classList.add(
                            "active"
                        );
                    }
                }
            );
        }
    );


    /* COURSE SYLLABUS*/
    const syllabusFile =
        document.getElementById(
            "syllabusFile"
        );

    const syllabusLastUpdated =
        document.getElementById(
            "syllabusLastUpdated"
        );

    const syllabusEmpty =
        document.getElementById(
            "facultySyllabusEmpty"
        );

    const syllabusFileRow =
        document.getElementById(
            "facultySyllabusFileRow"
        );

    const syllabusFileName =
        document.getElementById(
            "syllabusFileName"
        );

    const syllabusFileSize =
        document.getElementById(
            "syllabusFileSize"
        );

    const viewSyllabusButton =
        document.getElementById(
            "viewSyllabusButton"
        );

    const downloadSyllabusButton =
        document.getElementById(
            "downloadSyllabusButton"
        );

    const syllabusMoreButton =
        document.getElementById(
            "syllabusMoreButton"
        );

    const syllabusFileMenu =
        document.getElementById(
            "syllabusFileMenu"
        );

    const deleteSyllabusOption =
        document.getElementById(
            "deleteSyllabusOption"
        );

    const deleteSyllabusModal =
        document.getElementById(
            "deleteSyllabusModal"
        );

    const deleteSyllabusBackdrop =
        document.getElementById(
            "deleteSyllabusBackdrop"
        );


    const deleteSyllabusFileName =
        document.getElementById(
            "deleteSyllabusFileName"
        );

    const cancelDeleteSyllabus =
        document.getElementById(
            "cancelDeleteSyllabus"
        );

    const confirmDeleteSyllabus =
        document.getElementById(
            "confirmDeleteSyllabus"
        );

    let currentSyllabusURL =
        null;

    let currentSyllabusFile =
        null;

    /* SYLLABUS UPLOAD*/
    if (syllabusFile) {
        syllabusFile.addEventListener(
            "change",
            function () {
                if (
                    !this.files ||
                    !this.files.length
                ) {
                    return;
                }
                const file =
                    this.files[0];
                const isPDF =
                    file.type ===
                        "application/pdf" ||
                    file.name
                        .toLowerCase()
                        .endsWith(".pdf");
                if (!isPDF) {
                    alert(
                        "Please upload a PDF file."
                    );
                    this.value =
                        "";
                    return;
                }

                if (currentSyllabusURL) {
                    URL.revokeObjectURL(
                        currentSyllabusURL
                    );
                }

                currentSyllabusFile =
                    file;
                currentSyllabusURL =
                    URL.createObjectURL(
                        file
                    );

                if (syllabusFileName) {
                    syllabusFileName.textContent =
                        file.name;
                }

                if (syllabusFileSize) {
                    syllabusFileSize.textContent =
                        formatFileSize(
                            file.size
                        );
                }

                if (syllabusLastUpdated) {
                    syllabusLastUpdated.textContent =
                        "Last Updated: " +
                        getTodayFormatted();
                }

                if (syllabusEmpty) {
                    syllabusEmpty.hidden =
                        true;
                }

                if (syllabusFileRow) {
                    syllabusFileRow.hidden =
                        false;
                }
            }
        );
    }

    /* VIEW SYLLABUS*/
    if (viewSyllabusButton) {
        viewSyllabusButton.addEventListener(
            "click",
            function () {
                if (!currentSyllabusURL) {
                    alert(
                        "No syllabus has been uploaded."
                    );
                    return;
                }

                window.open(
                    currentSyllabusURL,
                    "_blank"
                );
            }
        );
    }

    /* DOWNLOAD SYLLABUS */
    if (downloadSyllabusButton) {
        downloadSyllabusButton.addEventListener(
            "click",
            function () {
                if (
                    !currentSyllabusURL ||
                    !currentSyllabusFile
                                    ) {
                    alert(
                        "No syllabus has been uploaded."
                    );
                    return;

                }
                const link =
                    document.createElement(
                        "a"
                    );

                link.href =
                    currentSyllabusURL;
                link.download =
                    currentSyllabusFile.name;
                document.body.appendChild(
                    link
                );
                link.click();
                link.remove();

            }
        );

    }

    /* SYLLABUS MORE MENU*/
    if (
        syllabusMoreButton &&
        syllabusFileMenu
    ) {
        syllabusMoreButton.addEventListener(
            "click",
            function (event) {

                event.stopPropagation();
                syllabusFileMenu.hidden =
                    !syllabusFileMenu.hidden;
                syllabusMoreButton.setAttribute(
                    "aria-expanded",
                    String(
                        !syllabusFileMenu.hidden
                    )
                );
            }
        );

        document.addEventListener(
            "click",
            function (event) {

                if (
                    !syllabusFileMenu.hidden &&
                    !syllabusFileMenu.contains(
                        event.target
                    ) &&
                    !syllabusMoreButton.contains(
                        event.target
                    )
                ) {
                    syllabusFileMenu.hidden =
                        true;
                    syllabusMoreButton.setAttribute(
                        "aria-expanded",
                        "false"
                    );
                }
            }
        );

    }

    /* OPEN DELETE SYLLABUS*/
    if (deleteSyllabusOption) {
        deleteSyllabusOption.addEventListener(
            "click",
            function () {

                if (
                    syllabusFileMenu
                ) {

                    syllabusFileMenu.hidden =
                        true;

                }

                if (
                    deleteSyllabusFileName
                ) {

                    deleteSyllabusFileName.textContent =
                        currentSyllabusFile
                            ? currentSyllabusFile.name
                            : "this syllabus";

                }

                openModal(
                    deleteSyllabusModal
                );
            }
        );
    }

    /* CANCEL DELETE SYLLABUS */
    if (cancelDeleteSyllabus) {

        cancelDeleteSyllabus.addEventListener(
            "click",
            function () {

                closeModal(
                    deleteSyllabusModal
                );
            }
        );
    }

    if (deleteSyllabusBackdrop) {
        deleteSyllabusBackdrop.addEventListener(
            "click",
            function () {
                closeModal(
                    deleteSyllabusModal
                );
            }
        );
    }

    /* CONFIRM DELETE SYLLABUS */
    if (confirmDeleteSyllabus) {
        confirmDeleteSyllabus.addEventListener(
            "click",
            function () {
                if (currentSyllabusURL) {
                    URL.revokeObjectURL(
                        currentSyllabusURL
                    );
                }
                currentSyllabusURL =
                    null;
                currentSyllabusFile =
                    null;
                if (syllabusFile) {
                    syllabusFile.value =
                        "";

                }
                if (syllabusFileName) {
                    syllabusFileName.textContent =
                        "Course_Syllabus.pdf";

                }

                if (syllabusFileSize) {
                    syllabusFileSize.textContent =
                        "0 MB";
                }

                if (syllabusLastUpdated) {
                    syllabusLastUpdated.textContent =
                        "No syllabus uploaded";
                }
                if (syllabusFileRow) {
                    syllabusFileRow.hidden =
                        true;
                }
                if (syllabusEmpty) {
                    syllabusEmpty.hidden =
                        false;
                }
                closeModal(
                    deleteSyllabusModal
                );
            }
        );

    }

    /* COURSE OUTCOME*/
    const addCourseOutcomeButton =
        document.getElementById(
            "addCourseOutcomeButton"
        );

    const courseOutcomeModal =
        document.getElementById(
            "courseOutcomeModal"
        );

    const courseOutcomeBackdrop =
        document.getElementById(
            "courseOutcomeBackdrop"
        );

    const courseOutcomeModalTitle =
        document.getElementById(
            "courseOutcomeModalTitle"
        );


    const courseOutcomeModalSubtitle =
        document.getElementById(
            "courseOutcomeModalSubtitle"
        );

    const courseOutcomeSelect =
        document.getElementById(
            "courseOutcomeExistingSelect"
        );

    const courseOutcomeNumber =
        document.getElementById(
            "courseOutcomeNumber"
        );

    const courseOutcomeDescription =
        document.getElementById(
            "courseOutcomeDescription"
        );

    const cancelCourseOutcomeButton =
        document.getElementById(
            "cancelCourseOutcomeButton"
        );

    const saveCourseOutcomeButton =
        document.getElementById(
            "saveCourseOutcomeButton"
        );

    const courseOutcomesTableBody =
        document.getElementById(
            "courseOutcomesTableBody"
        );

    let editingCourseOutcomeRow =
        null;
    let deletingCourseOutcomeRow =
        null;

    /* COURSE OUTCOME SO HELPERS */
    function getAlignedSOOptions() {

        return Array.from(
            document.querySelectorAll(
                "#courseOutcomeSoOptions .sof-so-option"
            )
        );

    }

    function getSelectedAlignedSOs() {

        return Array.from(
            document.querySelectorAll(
                "#courseOutcomeSoOptions .sof-so-option"
            )
        )
        .filter(
            function (option) {

                const style =
                    window.getComputedStyle(option);

                return (
                    option.classList.contains("selected") ||
                    option.classList.contains("is-selected") ||
                    option.getAttribute("aria-pressed") === "true" ||
                    option.dataset.selected === "true" ||
                    style.backgroundColor === "rgb(0, 65, 121)"
                );

            }
        )
        .map(
            function (option) {

                return (
                    option.dataset.so ||
                    option.value ||
                    option.textContent.trim()
                );

            }
        );

    }

    function clearAlignedSOs() {
        getAlignedSOOptions()
            .forEach(
                function (option) {
                    option.classList.remove(
                        "selected",
                        "is-selected"
                    );

                    option.setAttribute(
                        "aria-pressed",
                        "false"
                    );
                }
            );
    }

    function setAlignedSOs(values) {
        const selectedValues =
            Array.isArray(values)
                ? values
                : [];

        getAlignedSOOptions()
            .forEach(
                function (option) {
                    const value =
                        option.dataset.so ||
                        option.value ||
                        option.textContent.trim();
                    const selected =
                        selectedValues.includes(value);
                    option.classList.toggle(
                        "selected",
                        selected
                    );
                    option.classList.toggle(
                        "is-selected",
                        selected
                    );
                    option.setAttribute(
                        "aria-pressed",
                        selected ? "true" : "false"
                    );
                }
            );
    }

    /* SO BUTTON MULTI-SELECT*/
    getAlignedSOOptions()
        .forEach(
            function (option) {

                if (
                    option.dataset.soMultiSelectInitialized ===
                    "true"
                ) {
                    return;
                }

                option.dataset.soMultiSelectInitialized =
                    "true";

                if (
                    !option.hasAttribute("aria-pressed")
                ) {
                    option.setAttribute(
                        "aria-pressed",
                        "false"
                    );
                     }
                option.addEventListener(
                    "click",
                    function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        const selected =
                            !this.classList.contains(
                                "selected"
                            );

                        this.classList.toggle(
                            "selected",
                            selected
                        );

                        this.classList.toggle(
                            "is-selected",
                            selected
                        );

                        this.setAttribute(
                            "aria-pressed",
                            selected ? "true" : "false"
                        );
                    }
                );
            }
        );

    /* COURSE OUTCOME SELECT*/
    if (courseOutcomeSelect) {
        courseOutcomeSelect.addEventListener(
            "change",
            function () {
                const option =
                    this.options[
                        this.selectedIndex
                    ];

                if (
                    !option ||
                    !option.value
                ) {
                    if (courseOutcomeNumber) {
                        courseOutcomeNumber.value =
                            "";
                    }

                    if (courseOutcomeDescription) {
                        courseOutcomeDescription.value =
                            "";
                    }
                    return;
                }

                if (courseOutcomeNumber) {
                    courseOutcomeNumber.value =
                        option.value;
                }

                if (courseOutcomeDescription) {
                    courseOutcomeDescription.value =
                        option.dataset.description ||
                        "";
                }
            }
        );
    }

    /* RESET COURSE OUTCOME FORM*/
    function resetCourseOutcomeForm() {
        editingCourseOutcomeRow =
            null;

        if (courseOutcomeSelect) {
            courseOutcomeSelect.disabled =
                false;
            courseOutcomeSelect.value =
                "";
        }
        if (courseOutcomeNumber) {
            courseOutcomeNumber.value =
                "";
        }
        if (courseOutcomeDescription) {
            courseOutcomeDescription.value =
                "";
        }
        clearAlignedSOs();
        if (saveCourseOutcomeButton) {
            saveCourseOutcomeButton.textContent =
                "Save";
        }
    }

    /*OPEN ADD COURSE OUTCOME*/
    if (addCourseOutcomeButton) {
        addCourseOutcomeButton.addEventListener(
            "click",
            function () {
                resetCourseOutcomeForm();
                                if (courseOutcomeModalTitle) {
                    courseOutcomeModalTitle.textContent =
                        "Add Course Outcome";
                }

                if (courseOutcomeModalSubtitle) {
                    courseOutcomeModalSubtitle.textContent =
                        "Select an existing course outcome and its aligned student outcomes.";

                }

                openModal(
                    courseOutcomeModal
                );
            }
        );
    }


    /* CLOSE COURSE OUTCOME*/
    function closeCourseOutcomeForm() {
        closeModal(
            courseOutcomeModal
        );
        resetCourseOutcomeForm();
    }

    if (cancelCourseOutcomeButton) {
        cancelCourseOutcomeButton.addEventListener(
            "pointerdown",
            function (event) {

                event.preventDefault();

                closeCourseOutcomeForm();
            }
        );
    }

    if (courseOutcomeBackdrop) {
        courseOutcomeBackdrop.addEventListener(
            "pointerdown",
            function (event) {
                event.preventDefault();
                closeCourseOutcomeForm();
            }
        );
    }

    /* SAVE COURSE OUTCOME*/
    if (saveCourseOutcomeButton) {
        saveCourseOutcomeButton.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                const coNumber =
                    courseOutcomeNumber
                        ? courseOutcomeNumber.value.trim()
                        : "";
                const description =
                    courseOutcomeDescription
                        ? courseOutcomeDescription.value.trim()
                        : "";

                const alignedSOs =
                    getSelectedAlignedSOs();

                if (
                    !coNumber ||
                    !description
                ) {

                    alert(
                        "Please select a Course Outcome."
                    );
                    return;
                }

                if (
                    alignedSOs.length === 0
                ) {
                    alert(
                        "Please select at least one aligned Student Outcome."
                    );
                    return;

                }

                /* EDIT
                   UPDATE EXISTING ROW ONLY*/
                if (editingCourseOutcomeRow) {
                    const cells =
                        editingCourseOutcomeRow
                            .querySelectorAll(
                                "td"
                            );

                    editingCourseOutcomeRow.dataset.coNumber =
                        coNumber;
                    editingCourseOutcomeRow.dataset.description =
                        description;
                    editingCourseOutcomeRow.dataset.alignedSo =
                        JSON.stringify(
                            alignedSOs
                        );

                    if (cells.length >= 3) {
                        cells[0].textContent =
                            coNumber;

                        cells[1].textContent =
                            description;

                        cells[2].textContent =
                            alignedSOs.join(
                                ", "
                            );
                    }
                    closeCourseOutcomeForm();
                    return;
                }

                /*PREVENT DUPLICATE CO*/
                const duplicate =
                    Array.from(
                        courseOutcomesTableBody
                            .querySelectorAll(
                                "tr"
                            )
                    )
                    .some(
                        function (row) {

                            return (
                                row.dataset.coNumber ===
                                coNumber
                            );

                        }
                    );
                if (duplicate) {
                    alert(
                        coNumber +
                        " has already been added."
                    );
                    return;
                }

                /* ADD NEW COURSE OUTCOME*/
                const row =
                    document.createElement(
                        "tr"
                    );
                row.dataset.coNumber =
                    coNumber;
                row.dataset.description =
                    description;
                row.dataset.alignedSo =
                    JSON.stringify(
                        alignedSOs
                    );
                row.innerHTML = `
                    <td>
                        ${escapeHTML(coNumber)}
                    </td>
                    <td>
                        ${escapeHTML(description)}
                    </td>
                    <td>
                        ${escapeHTML(
                            alignedSOs.join(", ")
                        )}
                    </td>
                    <td>
                        <div class="sof-row-actions">
                            <button
                                type="button"
                                class="
                                    sof-edit-outcome-btn
                                    js-edit-course-outcome
                                "
                            >
                                Edit
                            </button>
                            <button
                                type="button"
                                class="
                                    sof-delete-outcome-btn
                                    js-delete-course-outcome
                                "
                            >
                                Delete
                            </button>
                        </div>
                    </td>
                `;
                courseOutcomesTableBody.appendChild(
                    row
                );
                closeCourseOutcomeForm();
            }
        );

    }

    /* COURSE OUTCOME TABLE ACTIONS */
    if (courseOutcomesTableBody) {
        courseOutcomesTableBody.addEventListener(
            "click",
            function (event) {

                const editButton =
                    event.target.closest(
                        ".js-edit-course-outcome"
                    );

                const deleteButton =
                    event.target.closest(
                        ".js-delete-course-outcome"
                    );

                /*  EDIT COURSE OUTCOME*/
                if (editButton) {

                    const row =
                        editButton.closest(
                            "tr"
                        );

                    if (!row) {
                        return;
                    }

                    editingCourseOutcomeRow =
                        row;

                    const coNumber =
                        row.dataset.coNumber ||
                        row.cells[0]
                            .textContent
                            .trim();

                    const description =
                        row.dataset.description ||
                        row.cells[1]
                            .textContent
                            .trim();
                    let alignedSOs =
                        [];

                    try {
                        alignedSOs =
                            JSON.parse(
                                row.dataset.alignedSo ||
                                "[]"
                            );
                    }
                    catch (error) {
                        alignedSOs =
                            row.cells[2]
                                .textContent
                                .split(",")
                                .map(
                                    function (item) {
                                        return item.trim();
                                    }
                                )
                                .filter(Boolean);
                    }

                    if (courseOutcomeSelect) {
                        courseOutcomeSelect.value =
                            coNumber;


                        /*
                         Editing an existing CO should update
                         that CO instead of selecting another
                         CO and accidentally creating a new one.
                         */

                        courseOutcomeSelect.disabled =
                            true;
                    }

                    if (courseOutcomeNumber) {
                        courseOutcomeNumber.value =
                            coNumber;
                    }

                    if (courseOutcomeDescription) {

                        courseOutcomeDescription.value =
                            description;
                    }

                    setAlignedSOs(
                        alignedSOs
                    );

                    if (courseOutcomeModalTitle) {
                        courseOutcomeModalTitle.textContent =
                            "Edit Course Outcome";
                    }

                    if (courseOutcomeModalSubtitle) {
                        courseOutcomeModalSubtitle.textContent =
                            "Update the selected course outcome details below.";
                    }
                    if (saveCourseOutcomeButton) {
                        saveCourseOutcomeButton.textContent =
                            "Update";
                    }
                    openModal(
                        courseOutcomeModal
                    );
                    return;
                }

                /*DELETE COURSE OUTCOME*/
                if (deleteButton) {
                    const row =
                        deleteButton.closest(
                            "tr"
                        );

                    if (!row) {
                        return;
                    }
                    deletingCourseOutcomeRow =
                        row;

                    const deleteModal =
                        document.getElementById(
                            "deleteCourseOutcomeModal"
                        );

                    const deleteName =
                        document.getElementById(
                            "deleteCourseOutcomeName"
                        );

                    if (deleteName) {

                        deleteName.textContent =
                            row.dataset.coNumber ||
                            row.cells[0]
                                .textContent
                                .trim();

                    }
                    openModal(
                        deleteModal
                    );
                }
            }
        );

    }


    /* DELETE COURSE OUTCOME MODAL */
    const deleteCourseOutcomeModal =
        document.getElementById(
            "deleteCourseOutcomeModal"
        );
    const deleteCourseOutcomeBackdrop =
        document.getElementById(
            "deleteCourseOutcomeBackdrop"
        );
    const cancelDeleteCourseOutcome =
        document.getElementById(
            "cancelDeleteCourseOutcome"
        );
    const confirmDeleteCourseOutcome =
        document.getElementById(
            "confirmDeleteCourseOutcome"
        );
    function closeDeleteCourseOutcome() {
        deletingCourseOutcomeRow =
            null;
        closeModal(
            deleteCourseOutcomeModal
        );
    }

    if (cancelDeleteCourseOutcome) {
        cancelDeleteCourseOutcome.addEventListener(
            "click",
            closeDeleteCourseOutcome
        );
    }

    if (deleteCourseOutcomeBackdrop) {

        deleteCourseOutcomeBackdrop.addEventListener(
            "click",
            closeDeleteCourseOutcome
        );
    }

    if (confirmDeleteCourseOutcome) {
        confirmDeleteCourseOutcome.addEventListener(
            "click",
            function () {
                if (deletingCourseOutcomeRow) {
                    deletingCourseOutcomeRow.remove();
                }
                deletingCourseOutcomeRow =
                    null;
                closeModal(
                    deleteCourseOutcomeModal
                );
            }
        );
    }

    /* STUDENT OUTCOME */
    const studentOutcomeStorageKey =
        "eduMetricsStudentOutcomes";

    const addStudentOutcomeButton =
        document.getElementById(
            "addStudentOutcomeButton"
        );

    const studentOutcomeModal =
        document.getElementById(
            "studentOutcomeModal"
        );

    const studentOutcomeBackdrop =
        document.getElementById(
            "studentOutcomeModalBackdrop"
        );

    const studentOutcomeModalTitle =
        document.getElementById(
            "studentOutcomeModalTitle"
        );

    const studentOutcomeModalSubtitle =
        document.getElementById(
            "studentOutcomeModalSubtitle"
        );

    const studentOutcomeSelect =
        document.getElementById(
            "studentOutcomeSelect"
        );

    const studentOutcomeDueDate =
        document.getElementById(
            "studentOutcomeDueDate"
        );

    const studentOutcomeStatus =
        document.getElementById(
            "studentOutcomeStatus"
        );

    const cancelStudentOutcomeButton =
        document.getElementById(
            "cancelStudentOutcomeButton"
        );

    const saveStudentOutcomeButton =
        document.getElementById(
            "saveStudentOutcomeButton"
        );

    const studentOutcomeTableBody =
        document.getElementById(
            "studentOutcomeTableBody"
        );

    const studentOutcomeEmptyState =
        document.getElementById(
            "studentOutcomeEmptyState"
        );

    const facultyStudentOutcomeCount =
        document.getElementById(
            "facultyStudentOutcomeCount"
        );

    const facultyActiveOutcomeCount =
        document.getElementById(
            "facultyActiveOutcomeCount"
        );

    const deleteStudentOutcomeModal =
        document.getElementById(
            "deleteStudentOutcomeModal"
        );

    const deleteStudentOutcomeBackdrop =
        document.getElementById(
            "deleteStudentOutcomeBackdrop"
        );

    const deleteStudentOutcomeName =
        document.getElementById(
            "deleteStudentOutcomeName"
        );

    const cancelDeleteStudentOutcome =
        document.getElementById(
            "cancelDeleteStudentOutcome"
        );

    const confirmDeleteStudentOutcome =
        document.getElementById(
            "confirmDeleteStudentOutcome"
        );

    let editingStudentOutcomeId =
        null;

    let deletingStudentOutcomeId =
        null;

    function getStudentOutcomeTitle(code) {
        return (
            "SELF-ASSESSMENT AND REFLECTION ON ATTAINMENT OF STUDENT OUTCOME (" +
            code +
            ")"
        );
    }

    function getStudentOutcomeLink(code) {
        return (
            "assessment/so-" +
            code +
            ".html"
        );
    }

    function getStoredStudentOutcomes() {
        try {
            const stored =
                localStorage.getItem(
                    studentOutcomeStorageKey
                );

            if(!stored) {
                return [];
            }

            const parsed =
                JSON.parse(stored);

            return Array.isArray(parsed)
                ? parsed
                : [];
        }
        catch(error) {
            console.error(
                "Unable to load Student Outcomes:",
                error
            );

            return [];
        }
    }

    function saveStoredStudentOutcomes(outcomes) {
        localStorage.setItem(
            studentOutcomeStorageKey,
            JSON.stringify(outcomes)
        );
    }

    function getStudentOutcomeStatusClass(status) {
        switch(status) {
            case "Active":
                return "sof-status-active";

            case "Closed":
                return "sof-status-closed";

            case "Archived":
                return "sof-status-archived";

            default:
                return "sof-status-draft";
        }
    }

    function resetStudentOutcomeForm() {
        editingStudentOutcomeId =
            null;

        if(studentOutcomeSelect) {
            studentOutcomeSelect.value =
                "";
            studentOutcomeSelect.disabled =
                false;
        }

        if(studentOutcomeDueDate) {
            studentOutcomeDueDate.value =
                "";
        }

        if(studentOutcomeStatus) {
            studentOutcomeStatus.value =
                "Active";
        }

        if(studentOutcomeModalTitle) {
            studentOutcomeModalTitle.textContent =
                "Upload Student Outcome";
        }

        if(studentOutcomeModalSubtitle) {
            studentOutcomeModalSubtitle.textContent =
                "Select the Student Outcome to assign, set its due date, and choose its status.";
        }

        if(saveStudentOutcomeButton) {
            saveStudentOutcomeButton.textContent =
                "Upload";
        }
    }

    function updateStudentOutcomeSummary(outcomes) {
        if(facultyStudentOutcomeCount) {
            facultyStudentOutcomeCount.textContent =
                outcomes.length;
        }

        if(facultyActiveOutcomeCount) {
            facultyActiveOutcomeCount.textContent =
                outcomes.filter(
                    function (outcome) {
                        return (
                            outcome.status ===
                            "Active"
                        );
                    }
                ).length;
        }
    }

    function renderStoredStudentOutcomes() {
        if(!studentOutcomeTableBody) {
            return;
        }

        const outcomes =
            getStoredStudentOutcomes();

        studentOutcomeTableBody.innerHTML =
            "";

        outcomes.forEach(
            function (outcome) {
                const row =
                    document.createElement(
                        "tr"
                    );

                row.dataset.id =
                    outcome.id;

                row.innerHTML = `
                    <td>
                        <strong class="sof-outcome-name">
                            ${escapeHTML(outcome.title)}
                        </strong>
                    </td>
                    <td>${escapeHTML(formatDate(outcome.dueDate))}</td>
                    <td>${Number(outcome.responses) || 0}</td>
                    <td>
                        <span class="sof-status-pill ${getStudentOutcomeStatusClass(outcome.status)}">
                            ${escapeHTML(outcome.status)}
                        </span>
                    </td>
                    <td>
                        <div class="sof-row-actions">
                            <button type="button" class="sof-row-action-btn sof-view-outcome-btn" data-id="${escapeHTML(outcome.id)}">View</button>
                            <button type="button" class="sof-row-action-btn sof-edit-outcome-btn" data-id="${escapeHTML(outcome.id)}">Edit</button>
                            <button type="button" class="sof-row-action-btn sof-delete-outcome-btn" data-id="${escapeHTML(outcome.id)}">Delete</button>
                        </div>
                    </td>
                `;

                studentOutcomeTableBody.appendChild(
                    row
                );
            }
        );

        if(studentOutcomeEmptyState) {
            studentOutcomeEmptyState.hidden =
                outcomes.length > 0;
        }

        updateStudentOutcomeSummary(
            outcomes
        );
    }

    function closeStudentOutcomeForm() {
        closeModal(
            studentOutcomeModal
        );

        resetStudentOutcomeForm();
    }

    if(addStudentOutcomeButton) {
        addStudentOutcomeButton.addEventListener(
            "click",
            function () {
                resetStudentOutcomeForm();
                openModal(
                    studentOutcomeModal
                );
            }
        );
    }

    if(cancelStudentOutcomeButton) {
        cancelStudentOutcomeButton.addEventListener(
            "click",
            function () {
                closeStudentOutcomeForm();
            }
        );
    }

    if(studentOutcomeBackdrop) {
        studentOutcomeBackdrop.addEventListener(
            "click",
            function () {
                closeStudentOutcomeForm();
            }
        );
    }

    if(saveStudentOutcomeButton) {
        saveStudentOutcomeButton.addEventListener(
            "click",
            function () {
                const code =
                    studentOutcomeSelect
                        ? studentOutcomeSelect.value.trim()
                        : "";

                const dueDate =
                    studentOutcomeDueDate
                        ? studentOutcomeDueDate.value
                        : "";

                const status =
                    studentOutcomeStatus
                        ? studentOutcomeStatus.value
                        : "Active";

                if(!code) {
                    alert(
                        "Please select a Student Outcome."
                    );
                    return;
                }

                if(!dueDate) {
                    alert(
                        "Please select a due date."
                    );
                    return;
                }

                const outcomes =
                    getStoredStudentOutcomes();

                if(editingStudentOutcomeId) {
                    const index =
                        outcomes.findIndex(
                            function (outcome) {
                                return (
                                    outcome.id ===
                                    editingStudentOutcomeId
                                );
                            }
                        );

                    if(index !== -1) {
                        outcomes[index].dueDate =
                            dueDate;
                        outcomes[index].status =
                            status;
                    }
                }
                else {
                    const duplicate =
                        outcomes.some(
                            function (outcome) {
                                return (
                                    outcome.code ===
                                    code
                                );
                            }
                        );

                    if(duplicate) {
                        alert(
                            "This Student Outcome has already been added."
                        );
                        return;
                    }

                    outcomes.push({
                        id:
                            "so-" +
                            code +
                            "-" +
                            Date.now(),
                        code: code,
                        title:
                            getStudentOutcomeTitle(
                                code
                            ),
                        dueDate: dueDate,
                        status: status,
                        responses: 0,
                        link:
                            getStudentOutcomeLink(
                                code
                            )
                    });
                }

                saveStoredStudentOutcomes(
                    outcomes
                );

                closeStudentOutcomeForm();
                renderStoredStudentOutcomes();
            }
        );
    }

    if(studentOutcomeTableBody) {
        studentOutcomeTableBody.addEventListener(
            "click",
            function (event) {
                const viewButton =
                    event.target.closest(
                        ".sof-view-outcome-btn"
                    );

                const editButton =
                    event.target.closest(
                        ".sof-edit-outcome-btn"
                    );

                const deleteButton =
                    event.target.closest(
                        ".sof-delete-outcome-btn"
                    );

                const outcomes =
                    getStoredStudentOutcomes();

                if(viewButton) {
                    const outcome =
                        outcomes.find(
                            function (item) {
                                return (
                                    item.id ===
                                    viewButton.dataset.id
                                );
                            }
                        );

                    if(outcome && outcome.link) {
                        window.location.href =
                            outcome.link;
                    }
                    return;
                }

                if(editButton) {
                    const outcome =
                        outcomes.find(
                            function (item) {
                                return (
                                    item.id ===
                                    editButton.dataset.id
                                );
                            }
                        );

                    if(!outcome) {
                        return;
                    }

                    editingStudentOutcomeId =
                        outcome.id;

                    if(studentOutcomeSelect) {
                        studentOutcomeSelect.value =
                            outcome.code;
                        studentOutcomeSelect.disabled =
                            true;
                    }

                    if(studentOutcomeDueDate) {
                        studentOutcomeDueDate.value =
                            outcome.dueDate || "";
                    }

                    if(studentOutcomeStatus) {
                        studentOutcomeStatus.value =
                            outcome.status || "Active";
                    }

                    if(studentOutcomeModalTitle) {
                        studentOutcomeModalTitle.textContent =
                            "Edit Student Outcome";
                    }

                    if(studentOutcomeModalSubtitle) {
                        studentOutcomeModalSubtitle.textContent =
                            "Update the due date or status of this Student Outcome.";
                    }

                    if(saveStudentOutcomeButton) {
                        saveStudentOutcomeButton.textContent =
                            "Save Changes";
                    }

                    openModal(
                        studentOutcomeModal
                    );
                    return;
                }

                if(deleteButton) {
                    const outcome =
                        outcomes.find(
                            function (item) {
                                return (
                                    item.id ===
                                    deleteButton.dataset.id
                                );
                            }
                        );

                    if(!outcome) {
                        return;
                    }

                    deletingStudentOutcomeId =
                        outcome.id;

                    if(deleteStudentOutcomeName) {
                        deleteStudentOutcomeName.textContent =
                            outcome.title;
                    }

                    openModal(
                        deleteStudentOutcomeModal
                    );
                }
            }
        );
    }

    function closeDeleteStudentOutcome() {
        deletingStudentOutcomeId =
            null;

        closeModal(
            deleteStudentOutcomeModal
        );
    }

    if(cancelDeleteStudentOutcome) {
        cancelDeleteStudentOutcome.addEventListener(
            "click",
            closeDeleteStudentOutcome
        );
    }

    if(deleteStudentOutcomeBackdrop) {
        deleteStudentOutcomeBackdrop.addEventListener(
            "click",
            closeDeleteStudentOutcome
        );
    }

    if(confirmDeleteStudentOutcome) {
        confirmDeleteStudentOutcome.addEventListener(
            "click",
            function () {
                if(!deletingStudentOutcomeId) {
                    return;
                }

                const outcomes =
                    getStoredStudentOutcomes()
                        .filter(
                            function (outcome) {
                                return (
                                    outcome.id !==
                                    deletingStudentOutcomeId
                                );
                            }
                        );

                saveStoredStudentOutcomes(
                    outcomes
                );

                closeDeleteStudentOutcome();
                renderStoredStudentOutcomes();
            }
        );
    }

    window.addEventListener(
        "storage",
        function (event) {
            if(
                event.key ===
                studentOutcomeStorageKey
            ) {
                renderStoredStudentOutcomes();
            }
        }
    );

    renderStoredStudentOutcomes();

    /* ESCAPE KEY */
    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key !==
                "Escape"
            ) {
                return;
            }

            if (
                courseOutcomeModal &&
                !courseOutcomeModal.hidden
            ) {
                closeCourseOutcomeForm();
                return;
            }

            if (
                studentOutcomeModal &&
                !studentOutcomeModal.hidden
            ) {

                closeStudentOutcomeForm();

                return;

            }

            if (
                deleteCourseOutcomeModal &&
                !deleteCourseOutcomeModal.hidden
            ) {
                closeDeleteCourseOutcome();
                return;
            }

            if (
                deleteStudentOutcomeModal &&
                !deleteStudentOutcomeModal.hidden
            ) {
                closeDeleteStudentOutcome();
                return;
            }

            if (
                deleteSyllabusModal &&
                !deleteSyllabusModal.hidden
            ) {

                closeModal(
                    deleteSyllabusModal
                );
            }
        }
    );

    /* INITIAL PAGE STATE*/
   tabPanels.forEach(
        function (panel) {

            panel.classList.toggle(
                "active",
                panel.id ===
                    "syllabus"
            );

        }
    );


    tabs.forEach(
        function (tab) {

            tab.classList.toggle(
                "active",
                tab.dataset.tab ===
                    "syllabus"
            );

        }
    );
}


/* STUDENT PENDING STUDENT OUTCOMES */
document.addEventListener("DOMContentLoaded", function () {
    const page =
        document.querySelector(
            ".so-student-page"
        );

    const pendingSOList =
        document.getElementById(
            "pendingSOList"
        );

    const pendingSOEmpty =
        document.getElementById(
            "pendingSOEmpty"
        );

    if(!page || !pendingSOList || !pendingSOEmpty) {
        return;
    }

    const storageKey =
        "eduMetricsStudentOutcomes";

    const pendingSOSearch =
        document.getElementById(
            "pendingSOSearch"
        );

    const pendingSOCount =
        document.getElementById(
            "pendingSOCount"
        );

    const dueThisWeekCount =
        document.getElementById(
            "dueThisWeekCount"
        );

    function getStudentOutcomes() {
        try {
            const stored =
                localStorage.getItem(
                    storageKey
                );

            if(!stored) {
                return [];
            }

            const parsed =
                JSON.parse(stored);

            return Array.isArray(parsed)
                ? parsed
                : [];
        }
        catch(error) {
            console.error(
                "Unable to load Student Outcomes:",
                error
            );
            return [];
        }
    }

    function escapeStudentSOHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatStudentSODueDate(value) {
        if(!value) {
            return "No due date";
        }

        const date =
            new Date(
                value + "T00:00:00"
            );

        return date.toLocaleDateString(
            "en-US",
            {
                month: "short",
                day: "numeric",
                year: "numeric"
            }
        );
    }

    function isDueWithinSevenDays(value) {
        if(!value) {
            return false;
        }

        const today =
            new Date();

        today.setHours(
            0,
            0,
            0,
            0
        );

        const dueDate =
            new Date(
                value + "T00:00:00"
            );

        const lastDay =
            new Date(today);

        lastDay.setDate(
            lastDay.getDate() + 7
        );

        return (
            dueDate >= today &&
            dueDate <= lastDay
        );
    }

    function getActiveStudentOutcomes() {
        return getStudentOutcomes()
            .filter(
                function (outcome) {
                    return (
                        outcome.status ===
                        "Active"
                    );
                }
            );
    }

    function updateStudentSOSummary(outcomes) {
        if(pendingSOCount) {
            pendingSOCount.textContent =
                outcomes.length;
        }

        if(dueThisWeekCount) {
            dueThisWeekCount.textContent =
                outcomes.filter(
                    function (outcome) {
                        return isDueWithinSevenDays(
                            outcome.dueDate
                        );
                    }
                ).length;
        }
    }

    function renderPendingStudentOutcomes() {
        const searchValue =
            pendingSOSearch
                ? pendingSOSearch.value
                    .trim()
                    .toLowerCase()
                : "";

        const activeOutcomes =
            getActiveStudentOutcomes();

        const filteredOutcomes =
            activeOutcomes.filter(
                function (outcome) {
                    const searchable =
                        (
                            (outcome.title || "") +
                            " " +
                            (outcome.code || "")
                        ).toLowerCase();

                    return searchable.includes(
                        searchValue
                    );
                }
            );

        pendingSOList.innerHTML =
            "";

        filteredOutcomes.forEach(
            function (outcome) {
                const item =
                    document.createElement(
                        "article"
                    );

                item.className =
                    "so-pending-item";

                item.innerHTML = `
                    <div class="so-pending-information">
                        <h3 class="so-pending-title">${escapeStudentSOHTML(outcome.title)}</h3>
                        <div class="so-pending-meta">
                            <span class="so-pending-due">Due: ${escapeStudentSOHTML(formatStudentSODueDate(outcome.dueDate))}</span>
                            <span class="so-pending-status">Pending</span>
                        </div>
                    </div>
                    <button type="button" class="so-start-assessment-btn" data-link="${escapeStudentSOHTML(outcome.link || "")}">
                        Start Assessment
                    </button>
                `;

                pendingSOList.appendChild(
                    item
                );
            }
        );

        pendingSOList.hidden =
            filteredOutcomes.length === 0;

        pendingSOEmpty.hidden =
            filteredOutcomes.length > 0;

        updateStudentSOSummary(
            activeOutcomes
        );
    }

    pendingSOList.addEventListener(
        "click",
        function (event) {
            const button =
                event.target.closest(
                    ".so-start-assessment-btn"
                );

            if(!button) {
                return;
            }

            const link =
                button.dataset.link;

            if(link) {
                window.location.href =
                    link;
            }
        }
    );

    if(pendingSOSearch) {
        pendingSOSearch.addEventListener(
            "input",
            renderPendingStudentOutcomes
        );
    }

    window.addEventListener(
        "storage",
        function (event) {
            if(event.key === storageKey) {
                renderPendingStudentOutcomes();
            }
        }
    );

    renderPendingStudentOutcomes();
});

/* DEPARTMENT HEAD SYLLABUS & OUTCOMES */
document.addEventListener("DOMContentLoaded", function () {
    const tabs =
        document.querySelectorAll(
            ".sodh-tab"
        );

    const panels =
        document.querySelectorAll(
            ".sodh-tab-panel"
        );

    if(!tabs.length || !panels.length) {
        return;
    }

    tabs.forEach(
        function (tab) {
            tab.addEventListener(
                "click",
                function () {
                    const targetId =
                        this.dataset.tab;

                    if(!targetId) {
                        return;
                    }

                    tabs.forEach(
                        function (item) {
                            item.classList.remove(
                                "active"
                            );
                        }
                    );

                    panels.forEach(
                        function (panel) {
                            panel.classList.remove(
                                "active"
                            );
                        }
                    );

                    this.classList.add(
                        "active"
                    );

                    const targetPanel =
                        document.getElementById(
                            targetId
                        );

                    if(targetPanel) {
                        targetPanel.classList.add(
                            "active"
                        );
                    }
                }
            );
        }
    );
});

/* STUDENT OUTCOME SELF-ASSESSMENT — SHARED SO(A-L) */

document.addEventListener("DOMContentLoaded", function () {
    const assessmentPage = document.querySelector("body.soa-page");
    const nextButton = document.getElementById("soaNextButton");

    if(!assessmentPage || !nextButton) {
        return;
    }

    const ratingInputs =
        document.querySelectorAll(
            '.soa-rating-option input[type="radio"]'
        );

    const totalScoreElement =
        document.getElementById("soaTotalScore");

    const percentageElement =
        document.getElementById("soaPercentage");

    const message =
        document.getElementById("soaMessage");

    const indicatorNames =
        Array.from(ratingInputs)
            .map(function (input) {
                return input.name;
            })
            .filter(function (name, index, names) {
                return name && names.indexOf(name) === index;
            });

    const numberOfIndicators =
        indicatorNames.length;

    const maximumScore =
        numberOfIndicators * 3;

    const fileName =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();

    const soMatch =
        fileName.match(
            /^so-(g1|g2|[a-l])\.html$/
        );

    const currentSO =
        soMatch
            ? soMatch[1]
            : "a";

    function calculateScore() {
        let total = 0;

        indicatorNames.forEach(function (name) {
            const selected =
                document.querySelector(
                    'input[name="' + name + '"]:checked'
                );

            if(selected) {
                total += Number(selected.value);
            }
        });

        const percentage =
            maximumScore > 0
                ? (total / maximumScore) * 100
                : 0;

        if(totalScoreElement) {
            totalScoreElement.textContent =
                total + " / " + maximumScore;
        }

        if(percentageElement) {
            percentageElement.textContent =
                total === 0
                    ? "0%"
                    : percentage.toFixed(2) + "%";
        }

        return total;
    }

    function assessmentComplete() {
        return indicatorNames.every(
            function (name) {
                return Boolean(
                    document.querySelector(
                        'input[name="' + name + '"]:checked'
                    )
                );
            }
        );
    }

    function getStudentInformation() {
        const fieldIds = [
            "studentName",
            "program",
            "course",
            "section",
            "semester",
            "schoolYear"
        ];

        const information = {};

        fieldIds.forEach(function (id) {
            const field =
                document.getElementById(id);

            if(field) {
                information[id] =
                    field.value || field.textContent || "";
            }
        });

        return information;
    }

    ratingInputs.forEach(function (input) {
        input.addEventListener(
            "change",
            function () {
                calculateScore();

                if(message) {
                    message.classList.remove("show");
                }
            }
        );
    });

    nextButton.addEventListener(
        "click",
        function () {
            if(!assessmentComplete()) {
                if(message) {
                    message.classList.add("show");

                    message.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                }

                return;
            }

            const answers = {};
            let total = 0;

            indicatorNames.forEach(
                function (name, index) {
                    const selected =
                        document.querySelector(
                            'input[name="' + name + '"]:checked'
                        );

                    const score =
                        Number(selected.value);

                    answers[
                        "indicator" + (index + 1)
                    ] = score;

                    total += score;
                }
            );

            const assessmentData = {
                studentOutcome: currentSO,
                studentInformation:
                    getStudentInformation(),
                answers: answers,
                totalScore: total,
                maximumScore: maximumScore,
                percentage:
                    maximumScore > 0
                        ? Number(
                            (
                                (total / maximumScore) *
                                100
                            ).toFixed(2)
                        )
                        : 0
            };

            sessionStorage.setItem(
                "currentSOAssessment",
                JSON.stringify(
                    assessmentData
                )
            );

            window.location.href =
                "page-2.html?so=" +
                encodeURIComponent(currentSO);
        }
    );

    calculateScore();
});


/* STUDENT OUTCOME REFLECTION — SHARED PAGE 2 */

document.addEventListener("DOMContentLoaded", function () {
    const answer1 =
        document.getElementById("reflectionAnswer1");

    const answer2 =
        document.getElementById("reflectionAnswer2");

    const submitButton =
        document.getElementById("reflectionSubmitButton");

    const backButton =
        document.getElementById("reflectionBackButton");

    if(
        !answer1 ||
        !answer2 ||
        !submitButton ||
        !backButton
    ) {
        return;
    }

    const params =
        new URLSearchParams(
            window.location.search
        );

    const currentSO =
        params.get("so") || "a";

    const validStudentOutcomes = [
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g1",
        "g2",
        "h",
        "i",
        "j",
        "k",
        "l"
    ];

    const dateInput =
        document.getElementById("reflectionDate");

    const message =
        document.getElementById("reflectionMessage");

    const form =
        document.getElementById("reflectionForm");

    const success =
        document.getElementById("reflectionSuccess");

    const actions =
        document.getElementById("reflectionActions");

    const signatureCanvas =
        document.getElementById("studentSignature");

    const clearSignatureButton =
        document.getElementById("clearSignatureButton");

    let signatureContext = null;
    let isDrawing = false;
    let hasSignature = false;

    backButton.addEventListener(
        "click",
        function () {
            if(
                currentSO &&
                validStudentOutcomes.includes(currentSO)
            ) {
                window.location.href =
                    "so-" + currentSO + ".html";

                return;
            }

            window.location.href =
                "../so-student.html";
        }
    );

    function hideMessage() {
        const dateComplete =
            !dateInput || dateInput.value;

        const signatureComplete =
            !signatureCanvas || hasSignature;

        if(
            answer1.value.trim() &&
            answer2.value.trim() &&
            dateComplete &&
            signatureComplete &&
            message
        ) {
            message.classList.remove("show");
        }
    }

    answer1.addEventListener(
        "input",
        hideMessage
    );

    answer2.addEventListener(
        "input",
        hideMessage
    );

    if(dateInput) {
        dateInput.addEventListener(
            "input",
            hideMessage
        );
    }

    if(signatureCanvas) {
        signatureContext =
            signatureCanvas.getContext("2d");

        function resizeSignatureCanvas() {
            const rect =
                signatureCanvas.getBoundingClientRect();

            const ratio =
                Math.max(
                    window.devicePixelRatio || 1,
                    1
                );

            signatureCanvas.width =
                rect.width * ratio;

            signatureCanvas.height =
                rect.height * ratio;

            signatureContext.setTransform(
                ratio,
                0,
                0,
                ratio,
                0,
                0
            );

            signatureContext.lineWidth = 2;
            signatureContext.lineCap = "round";
            signatureContext.lineJoin = "round";
            signatureContext.strokeStyle =
                "#173B5C";
        }

        function getSignaturePosition(event) {
            const rect =
                signatureCanvas.getBoundingClientRect();

            return {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };
        }

        signatureCanvas.addEventListener(
            "pointerdown",
            function (event) {
                const position =
                    getSignaturePosition(event);

                isDrawing = true;

                signatureContext.beginPath();
                signatureContext.moveTo(
                    position.x,
                    position.y
                );

                signatureCanvas.setPointerCapture(
                    event.pointerId
                );
            }
        );

        signatureCanvas.addEventListener(
            "pointermove",
            function (event) {
                if(!isDrawing) {
                    return;
                }

                const position =
                    getSignaturePosition(event);

                signatureContext.lineTo(
                    position.x,
                    position.y
                );

                signatureContext.stroke();

                hasSignature = true;
                hideMessage();
            }
        );

        signatureCanvas.addEventListener(
            "pointerup",
            function (event) {
                isDrawing = false;

                if(
                    signatureCanvas.hasPointerCapture(
                        event.pointerId
                    )
                ) {
                    signatureCanvas.releasePointerCapture(
                        event.pointerId
                    );
                }
            }
        );

        signatureCanvas.addEventListener(
            "pointercancel",
            function () {
                isDrawing = false;
            }
        );

        if(clearSignatureButton) {
            clearSignatureButton.addEventListener(
                "click",
                function () {
                    signatureContext.clearRect(
                        0,
                        0,
                        signatureCanvas.width,
                        signatureCanvas.height
                    );

                    hasSignature = false;
                }
            );
        }

        resizeSignatureCanvas();
    }

    submitButton.addEventListener(
        "click",
        function () {
            const firstAnswer =
                answer1.value.trim();

            const secondAnswer =
                answer2.value.trim();

            const selectedDate =
                dateInput
                    ? dateInput.value
                    : "";

            const missingDate =
                dateInput && !selectedDate;

            const missingSignature =
                signatureCanvas && !hasSignature;

            if(
                !firstAnswer ||
                !secondAnswer ||
                missingDate ||
                missingSignature
            ) {
                if(message) {
                    message.classList.add("show");

                    message.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                }

                return;
            }

            let assessmentData = {};

            const storedAssessment =
                sessionStorage.getItem(
                    "currentSOAssessment"
                );

            if(storedAssessment) {
                try {
                    assessmentData =
                        JSON.parse(
                            storedAssessment
                        );
                }
                catch(error) {
                    assessmentData = {};
                }
            }

            assessmentData.studentOutcome =
                currentSO;

            assessmentData.reflection = {
                bestPerformanceIndicator:
                    firstAnswer,
                weakestPerformanceIndicator:
                    secondAnswer,
                signature:
                    signatureCanvas
                        ? signatureCanvas.toDataURL(
                            "image/png"
                        )
                        : "",
                date: selectedDate,
                submittedAt:
                    new Date().toISOString()
            };

            sessionStorage.setItem(
                "completedSOAssessment",
                JSON.stringify(
                    assessmentData
                )
            );

            if(form) {
                form.style.display = "none";
            }

            if(actions) {
                actions.style.display = "none";
            }

            if(success) {
                success.classList.add("show");
            }
        }
    );
});
