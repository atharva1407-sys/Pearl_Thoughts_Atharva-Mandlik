@echo off
setlocal

echo ========================================================
echo  Medrella Healthcare - Task 8 Offline Demo Environment
echo ========================================================
echo.

set DATABASE_URL=disabled
set USE_MOCK_PAYMENTS=true
set DEMO_DATA=true

if "%DEMO_RECEPTION_PASSWORD%"=="" (
    set /p DEMO_RECEPTION_PASSWORD="Enter password to set for reception.demo@medrella.demo: "
)
if "%DEMO_RECEPTION_PASSWORD%"=="" (
    echo [ERROR] DEMO_RECEPTION_PASSWORD cannot be empty. Please provide a password.
    exit /b 1
)

if "%DEMO_PATIENT_PASSWORD%"=="" (
    set /p DEMO_PATIENT_PASSWORD="Enter password to set for demo patient accounts: "
)
if "%DEMO_PATIENT_PASSWORD%"=="" (
    echo [ERROR] DEMO_PATIENT_PASSWORD cannot be empty. Please provide a password.
    exit /b 1
)

echo.
echo [OK] Offline demo environment configured.
echo Receptionist Login: reception.demo@medrella.demo
echo Front Desk Console: http://localhost:3100/reception
echo OPD Doctor Queue:   http://localhost:3100/queue
echo.
echo Starting Next.js server on port 3100...

call npm run dev -- -p 3100
