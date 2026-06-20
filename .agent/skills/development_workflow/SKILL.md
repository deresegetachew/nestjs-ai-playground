---
name: development_workflow
description: Procedures for feature branching, logical committing, and merging to main.
---

# Development Workflow Skill

## Overview
This skill defines the standard Git-based workflow for this project to ensure traceability, easy recovery, and token-efficient development.

## 1. Feature Branching
- Always start new work by creating a feature branch from `main`:
  ```bash
  git checkout -b feature/your-feature-name
  ```
- Do not commit directly to `main` for feature work.

## 2. Logical Committing
- Break down tasks into small, logical units.
- Commit after each unit is completed and verified:
  ```bash
  git add .
  git commit -m "feat: implement [component name]"
  ```
- Mention these commit points in your `implementation_plan.md` and `task.md`.

## 3. Merging & Cleanup
- When the task is fully complete and verified:
  1. Merge the feature branch into `main`.
  2. Delete the feature branch locally.
  ```bash
  git checkout main
  git merge feature/your-feature-name
  git branch -d feature/your-feature-name
  ```

