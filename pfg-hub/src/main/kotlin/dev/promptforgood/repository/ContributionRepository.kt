package dev.promptforgood.repository

import dev.promptforgood.model.Contribution
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface ContributionRepository : JpaRepository<Contribution, String>
