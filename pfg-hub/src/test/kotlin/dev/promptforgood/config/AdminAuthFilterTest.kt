package dev.promptforgood.config

import io.mockk.mockk
import io.mockk.verify
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletResponse
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class AdminAuthFilterTest {
    private val filterChain = mockk<FilterChain>(relaxed = true)

    // -------------------------------------------------------------------------
    // Routing — seed vs non-seed requests
    // -------------------------------------------------------------------------

    @Test
    fun `non-seed request bypasses admin auth and passes to filter chain`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("GET", "/issues/next")
        // No token — but non-seed requests should not be checked
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        verify { filterChain.doFilter(request, response) }
        assertFalse(response.status == HttpServletResponse.SC_UNAUTHORIZED)
    }

    @Test
    fun `runner endpoint bypasses admin auth and passes to filter chain`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("POST", "/runners/register")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        verify { filterChain.doFilter(request, response) }
    }

    @Test
    fun `stats endpoint bypasses admin auth and passes to filter chain`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("GET", "/stats")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        verify { filterChain.doFilter(request, response) }
    }

    // -------------------------------------------------------------------------
    // Seed requests — success path
    // -------------------------------------------------------------------------

    @Test
    fun `seed request with correct token is passed to the filter chain`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("POST", "/seed/repo")
        request.addHeader("X-Admin-Token", "secret")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        verify { filterChain.doFilter(request, response) }
        assertFalse(response.status == HttpServletResponse.SC_UNAUTHORIZED)
    }

    // -------------------------------------------------------------------------
    // Seed requests — rejection cases
    // -------------------------------------------------------------------------

    @Test
    fun `seed request with wrong token is rejected with 401`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("POST", "/seed/repo")
        request.addHeader("X-Admin-Token", "wrong-secret")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        assertTrue(response.status == HttpServletResponse.SC_UNAUTHORIZED)
    }

    @Test
    fun `seed request without token header is rejected with 401`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("POST", "/seed/repo")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        assertTrue(response.status == HttpServletResponse.SC_UNAUTHORIZED)
    }

    @Test
    fun `seed request with blank token header is rejected with 401`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("POST", "/seed/repo")
        request.addHeader("X-Admin-Token", "  ")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        assertTrue(response.status == HttpServletResponse.SC_UNAUTHORIZED)
    }

    @Test
    fun `seed request is rejected with 401 when admin key is not configured`() {
        val filter = AdminAuthFilter("")
        val request = MockHttpServletRequest("POST", "/seed/repo")
        request.addHeader("X-Admin-Token", "any-value")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        assertTrue(response.status == HttpServletResponse.SC_UNAUTHORIZED)
    }

    @Test
    fun `filter chain is NOT invoked when seed request is rejected`() {
        val filter = AdminAuthFilter("secret")
        val request = MockHttpServletRequest("POST", "/seed/repo")
        // No token header
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, filterChain)

        verify(exactly = 0) { filterChain.doFilter(any(), any()) }
    }
}
