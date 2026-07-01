/*
 * Shared AJAX helpers for the role dashboards.
 *
 * dashboardRequest(url, opts) is the single place that talks to the server:
 * it normalises the body, always checks response.ok, safely parses JSON, and
 * throws a consistent Error(message) on any failure (network, non-2xx, or a
 * JSON body with success:false). Dashboards catch that error and restore their
 * own UI (button state, alerts) so a failed request never leaves a button stuck.
 */
(function (global) {
    async function dashboardRequest(url, options = {}) {
        const { method = 'POST', body = null } = options;
        const fetchOptions = { method, headers: {} };

        if (body instanceof FormData) {
            // Let the browser set the multipart boundary itself.
            fetchOptions.body = body;
        } else if (body != null) {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        }

        let response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (networkError) {
            throw new Error('Network error. Please check your connection and try again.');
        }

        // Responses may legitimately be empty or non-JSON; treat those as {}.
        let data = null;
        try {
            data = await response.json();
        } catch (parseError) {
            data = null;
        }

        if (!response.ok || (data && data.success === false)) {
            const message = (data && data.message) || `Request failed (${response.status})`;
            throw new Error(message);
        }

        return data || {};
    }

    global.dashboardRequest = dashboardRequest;
})(window);
