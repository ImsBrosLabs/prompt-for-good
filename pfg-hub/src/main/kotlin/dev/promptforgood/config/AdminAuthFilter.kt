package dev.promptforgood.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Protects all `/seed/**` endpoints by requiring a valid X-Admin-Token header.
 * The expected token is configured via the ADMIN_KEY environment variable
 * (pfg.hub.admin-key in application.yml).
 *
 * If ADMIN_KEY is not set the endpoints are locked unconditionally — this
 * prevents accidental exposure in environments where the secret was forgotten.
 */
class AdminAuthFilter(
    private val adminKey: String,
) : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/seed")

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        if (adminKey.isBlank()) {
            logger.warn("ADMIN_KEY is not configured — seeding endpoints are locked")
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Admin key not configured")
            return
        }

        val token = request.getHeader("X-Admin-Token")
        if (token.isNullOrBlank() || token != adminKey) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid or missing X-Admin-Token")
            return
        }

        filterChain.doFilter(request, response)
    }
}
