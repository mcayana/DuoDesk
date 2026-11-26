// DuoDesk Virtual Display Driver — IddCx (UMDF 2.x) ARM64 / x64
// Copyright (C) 2026 DuoDesk Contributors. GPL-3.0, see LICENSE.
// Provides a native ARM64 & x64 Indirect Display Driver (Root\DuoDeskVDD) for DuoDesk Extend mode.
// Uses hardware Direct3D 11 GPU acceleration and loads custom resolutions from C:\VirtualDisplayDriver\vdd_settings.xml.

#include "Driver.h"
#include <fstream>
#include <regex>

using namespace Microsoft::WRL;
using namespace DuoDesk::Vdd;

namespace
{
    // 128-byte EDID block: Manufacturer "DUO" (0x12AF), Product 0x1337, 1920x1080@60Hz preferred
    constexpr BYTE kDefaultEdid[128] = {
        0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00,
        0x12, 0xAF, 0x37, 0x13, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x24, 0x01, 0x04, 0xA5, 0x3C, 0x22, 0x78,
        0x22, 0xEE, 0x91, 0xA3, 0x54, 0x4C, 0x99, 0x26,
        0x0F, 0x50, 0x54, 0x00, 0x00, 0x00, 0x01, 0x01,
        0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
        0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x3A,
        0x80, 0x18, 0x71, 0x38, 0x2D, 0x40, 0x58, 0x2C,
        0x45, 0x00, 0x58, 0x54, 0x21, 0x00, 0x00, 0x1E,
        0x00, 0x00, 0x00, 0xFC, 0x00, 'D',  'u',  'o',
        'D',  'e',  's',  'k',  ' ',  'V',  'D',  'D',
        0x0A, 0x20, 0x00, 0x00, 0x00, 0xFD, 0x00, 0x1E,
        0x78, 0x1E, 0xFF, 0x3C, 0x00, 0x0A, 0x20, 0x20,
        0x20, 0x20, 0x20, 0x20, 0x00, 0x00, 0x00, 0x10,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x62
    };

    constexpr DisplayModeSpec kDefaultModes[] = {
        { 1920, 1080, 60 },
        { 1920, 1080, 120 },
        { 2560, 1440, 60 },
        { 2560, 1440, 120 },
        { 2560, 1600, 60 },
        { 1280, 720,  60 },
        { 1600, 900,  60 },
        { 3840, 2160, 60 },
    };

    void FillSignalInfo(DISPLAYCONFIG_VIDEO_SIGNAL_INFO& mode, DWORD width, DWORD height, DWORD vsync, bool monitorMode)
    {
        ZeroMemory(&mode, sizeof(mode));
        mode.totalSize.cx = mode.activeSize.cx = width;
        mode.totalSize.cy = mode.activeSize.cy = height;
        mode.AdditionalSignalInfo.vSyncFreqDivider = monitorMode ? 0 : 1;
        mode.AdditionalSignalInfo.videoStandard = 255;
        mode.vSyncFreq.Numerator = vsync;
        mode.vSyncFreq.Denominator = 1;
        mode.hSyncFreq.Numerator = vsync * height;
        mode.hSyncFreq.Denominator = 1;
        mode.scanLineOrdering = DISPLAYCONFIG_SCANLINE_ORDERING_PROGRESSIVE;
        mode.pixelRate = static_cast<UINT64>(vsync) * width * height;
    }

    IDDCX_MONITOR_MODE CreateMonitorMode(DWORD width, DWORD height, DWORD vsync, IDDCX_MONITOR_MODE_ORIGIN origin)
    {
        IDDCX_MONITOR_MODE mode = {};
        mode.Size = sizeof(mode);
        mode.Origin = origin;
        FillSignalInfo(mode.MonitorVideoSignalInfo, width, height, vsync, true);
        return mode;
    }

    IDDCX_TARGET_MODE CreateTargetMode(DWORD width, DWORD height, DWORD vsync)
    {
        IDDCX_TARGET_MODE mode = {};
        mode.Size = sizeof(mode);
        FillSignalInfo(mode.TargetVideoSignalInfo.targetVideoSignalInfo, width, height, vsync, false);
        return mode;
    }
}

std::vector<DisplayModeSpec> DuoDesk::Vdd::LoadConfiguredModes()
{
    std::vector<DisplayModeSpec> modes(std::begin(kDefaultModes), std::end(kDefaultModes));
    std::ifstream in("C:\\VirtualDisplayDriver\\vdd_settings.xml");
    if (!in.is_open()) return modes;

    std::string xml((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    std::regex re(R"(<resolution>\s*<width>\s*(\d+)\s*</width>\s*<height>\s*(\d+)\s*</height>\s*<refresh_rate>\s*(\d+)\s*</refresh_rate>\s*</resolution>)");
    for (std::sregex_iterator it(xml.begin(), xml.end(), re), end; it != end; ++it)
    {
        DWORD w = static_cast<DWORD>(std::stoul((*it)[1].str()));
        DWORD h = static_cast<DWORD>(std::stoul((*it)[2].str()));
        DWORD r = static_cast<DWORD>(std::stoul((*it)[3].str()));
        if (w < 640 || h < 480 || w > 7680 || h > 4320 || r < 24 || r > 240) continue;
        bool dup = false;
        for (const auto& m : modes)
            if (m.Width == w && m.Height == h && m.VSync == r) { dup = true; break; }
        if (!dup) modes.push_back({ w, h, r });
    }
    return modes;
}

// ---- Direct3DDevice ----

Direct3DDevice::Direct3DDevice(LUID adapterLuid) : AdapterLuid(adapterLuid) {}
Direct3DDevice::Direct3DDevice() : AdapterLuid{} {}

HRESULT Direct3DDevice::Init()
{
    HRESULT hr = CreateDXGIFactory2(0, IID_PPV_ARGS(&DxgiFactory));
    if (FAILED(hr)) return hr;

    hr = DxgiFactory->EnumAdapterByLuid(AdapterLuid, IID_PPV_ARGS(&Adapter));
    if (FAILED(hr)) return hr;

    hr = D3D11CreateDevice(
        Adapter.Get(),
        D3D_DRIVER_TYPE_UNKNOWN,
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        nullptr,
        0,
        D3D11_SDK_VERSION,
        &Device,
        nullptr,
        &DeviceContext);
    return hr;
}

// ---- SwapChainProcessor ----

SwapChainProcessor::SwapChainProcessor(IDDCX_SWAPCHAIN swapChain, std::shared_ptr<Direct3DDevice> device, HANDLE newFrameEvent)
    : m_hSwapChain(swapChain), m_Device(std::move(device)), m_hAvailableBufferEvent(newFrameEvent)
{
    m_hTerminateEvent.Attach(CreateEvent(nullptr, FALSE, FALSE, nullptr));
    m_hThread.Attach(CreateThread(nullptr, 0, RunThread, this, 0, nullptr));
}

SwapChainProcessor::~SwapChainProcessor()
{
    SetEvent(m_hTerminateEvent.Get());
    if (m_hThread.Get()) WaitForSingleObject(m_hThread.Get(), INFINITE);
}

DWORD CALLBACK SwapChainProcessor::RunThread(LPVOID arg)
{
    reinterpret_cast<SwapChainProcessor*>(arg)->Run();
    return 0;
}

void SwapChainProcessor::Run()
{
    DWORD avTask = 0;
    HANDLE avTaskHandle = AvSetMmThreadCharacteristicsW(L"Distribution", &avTask);
    RunCore();
    WdfObjectDelete(m_hSwapChain);
    m_hSwapChain = nullptr;
    if (avTaskHandle) AvRevertMmThreadCharacteristics(avTaskHandle);
}

void SwapChainProcessor::RunCore()
{
    ComPtr<IDXGIDevice> dxgiDevice;
    if (FAILED(m_Device->Device.As(&dxgiDevice))) return;

    IDARG_IN_SWAPCHAINSETDEVICE setDevice = {};
    setDevice.pDevice = dxgiDevice.Get();
    if (FAILED(IddCxSwapChainSetDevice(m_hSwapChain, &setDevice))) return;

    for (;;)
    {
        ComPtr<IDXGIResource> acquiredBuffer;
        IDARG_OUT_RELEASEANDACQUIREBUFFER buffer = {};
        HRESULT hr = IddCxSwapChainReleaseAndAcquireBuffer(m_hSwapChain, &buffer);

        if (hr == E_PENDING)
        {
            HANDLE waitHandles[] = { m_hAvailableBufferEvent, m_hTerminateEvent.Get() };
            DWORD waitResult = WaitForMultipleObjects(ARRAYSIZE(waitHandles), waitHandles, FALSE, 16);
            if (waitResult == WAIT_OBJECT_0 || waitResult == WAIT_TIMEOUT) continue;
            break;
        }
        else if (SUCCEEDED(hr))
        {
            acquiredBuffer.Attach(buffer.MetaData.pSurface);
            // GPU-resident swapchain surface stays zero-copy; Desktop Duplication / WGC reads it directly.
            acquiredBuffer.Reset();
            hr = IddCxSwapChainFinishedProcessingFrame(m_hSwapChain);
            if (FAILED(hr)) break;
        }
        else
        {
            break;
        }
    }
}

// ---- IndirectMonitorContext ----

IndirectMonitorContext::IndirectMonitorContext(_In_ IDDCX_MONITOR monitor) : m_Monitor(monitor) {}
IndirectMonitorContext::~IndirectMonitorContext() { m_ProcessingThread.reset(); }

void IndirectMonitorContext::AssignSwapChain(IDDCX_SWAPCHAIN swapChain, LUID renderAdapter, HANDLE newFrameEvent)
{
    m_ProcessingThread.reset();
    auto device = std::make_shared<Direct3DDevice>(renderAdapter);
    if (FAILED(device->Init()))
    {
        WdfObjectDelete(swapChain);
        return;
    }
    m_ProcessingThread = std::make_unique<SwapChainProcessor>(swapChain, device, newFrameEvent);
}

void IndirectMonitorContext::UnassignSwapChain()
{
    m_ProcessingThread.reset();
}

// ---- IndirectDeviceContext ----

IndirectDeviceContext::IndirectDeviceContext(_In_ WDFDEVICE wdfDevice) : m_WdfDevice(wdfDevice), m_Adapter(nullptr) {}
IndirectDeviceContext::~IndirectDeviceContext() = default;

extern "C" {
    EVT_WDF_DRIVER_DEVICE_ADD DuoDeskVddDeviceAdd;
    EVT_WDF_DEVICE_D0_ENTRY DuoDeskVddDeviceD0Entry;
    EVT_IDD_CX_ADAPTER_INIT_FINISHED DuoDeskVddAdapterInitFinished;
    EVT_IDD_CX_ADAPTER_COMMIT_MODES DuoDeskVddAdapterCommitModes;
    EVT_IDD_CX_PARSE_MONITOR_DESCRIPTION DuoDeskVddParseMonitorDescription;
    EVT_IDD_CX_MONITOR_GET_DEFAULT_DESCRIPTION_MODES DuoDeskVddMonitorGetDefaultModes;
    EVT_IDD_CX_MONITOR_QUERY_TARGET_MODES DuoDeskVddMonitorQueryModes;
    EVT_IDD_CX_MONITOR_ASSIGN_SWAPCHAIN DuoDeskVddMonitorAssignSwapChain;
    EVT_IDD_CX_MONITOR_UNASSIGN_SWAPCHAIN DuoDeskVddMonitorUnassignSwapChain;
}

void IndirectDeviceContext::InitAdapter()
{
    IDDCX_ADAPTER_CAPS adapterCaps = {};
    adapterCaps.Size = sizeof(adapterCaps);
    adapterCaps.MaxMonitorsSupported = 1;
    adapterCaps.EndPointDiagnostics.Size = sizeof(adapterCaps.EndPointDiagnostics);
    adapterCaps.EndPointDiagnostics.TransmissionType = IDDCX_TRANSMISSION_TYPE_WIRED_OTHER;
    adapterCaps.EndPointDiagnostics.pEndPointFriendlyName = L"DuoDesk Virtual Display";
    adapterCaps.EndPointDiagnostics.pEndPointManufacturerName = L"DuoDesk";
    adapterCaps.EndPointDiagnostics.pEndPointModelName = L"DuoDesk ARM64/x64 Virtual Monitor";

    IDDCX_ENDPOINT_VERSION version = {};
    version.Size = sizeof(version);
    version.MajorVer = 2;
    version.MinorVer = 5;
    adapterCaps.EndPointDiagnostics.pFirmwareVersion = &version;
    adapterCaps.EndPointDiagnostics.pHardwareVersion = &version;

    WDF_OBJECT_ATTRIBUTES attr;
    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attr, IndirectDeviceContextWrapper);

    IDARG_IN_ADAPTER_INIT adapterInit = {};
    adapterInit.WdfDevice = m_WdfDevice;
    adapterInit.pCaps = &adapterCaps;
    adapterInit.ObjectAttributes = &attr;

    IDARG_OUT_ADAPTER_INIT adapterInitOut = {};
    NTSTATUS status = IddCxAdapterInitAsync(&adapterInit, &adapterInitOut);
    if (NT_SUCCESS(status))
    {
        m_Adapter = adapterInitOut.AdapterObject;
        auto* pCtx = WdfObjectGet_IndirectDeviceContextWrapper(m_Adapter);
        pCtx->pContext = this;
    }
}

void IndirectDeviceContext::FinishInit(UINT connectorIndex)
{
    WDF_OBJECT_ATTRIBUTES attr;
    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attr, IndirectMonitorContextWrapper);

    IDDCX_MONITOR_INFO monitorInfo = {};
    monitorInfo.Size = sizeof(monitorInfo);
    monitorInfo.MonitorType = DISPLAYCONFIG_OUTPUT_TECHNOLOGY_HDMI;
    monitorInfo.ConnectorIndex = connectorIndex;
    monitorInfo.MonitorDescription.Size = sizeof(monitorInfo.MonitorDescription);
    monitorInfo.MonitorDescription.Type = IDDCX_MONITOR_DESCRIPTION_TYPE_EDID;
    monitorInfo.MonitorDescription.DataSize = sizeof(kDefaultEdid);
    monitorInfo.MonitorDescription.pData = const_cast<BYTE*>(kDefaultEdid);
    CoCreateGuid(&monitorInfo.MonitorContainerId);

    IDARG_IN_MONITORCREATE monitorCreate = {};
    monitorCreate.ObjectAttributes = &attr;
    monitorCreate.pMonitorInfo = &monitorInfo;

    IDARG_OUT_MONITORCREATE monitorCreateOut = {};
    NTSTATUS status = IddCxMonitorCreate(m_Adapter, &monitorCreate, &monitorCreateOut);
    if (NT_SUCCESS(status))
    {
        auto* pMonWrapper = WdfObjectGet_IndirectMonitorContextWrapper(monitorCreateOut.MonitorObject);
        pMonWrapper->pContext = new IndirectMonitorContext(monitorCreateOut.MonitorObject);

        IDARG_OUT_MONITORARRIVAL arrivalOut = {};
        IddCxMonitorArrival(monitorCreateOut.MonitorObject, &arrivalOut);
    }
}

// ---- WDF / IddCx Entry Points ----

extern "C" NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT pDriverObject, _In_ PUNICODE_STRING pRegistryPath)
{
    WDF_DRIVER_CONFIG config;
    WDF_OBJECT_ATTRIBUTES attributes;

    WDF_OBJECT_ATTRIBUTES_INIT(&attributes);
    WDF_DRIVER_CONFIG_INIT(&config, DuoDeskVddDeviceAdd);

    return WdfDriverCreate(pDriverObject, pRegistryPath, &attributes, &config, WDF_NO_HANDLE);
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddDeviceAdd(WDFDRIVER driver, PWDFDEVICE_INIT pDeviceInit)
{
    UNREFERENCED_PARAMETER(driver);

    WDF_PNPPOWER_EVENT_CALLBACKS pnpPowerCallbacks;
    WDF_PNPPOWER_EVENT_CALLBACKS_INIT(&pnpPowerCallbacks);
    pnpPowerCallbacks.EvtDeviceD0Entry = DuoDeskVddDeviceD0Entry;
    WdfDeviceInitSetPnpPowerEventCallbacks(pDeviceInit, &pnpPowerCallbacks);

    IDDCX_CLIENT_CONFIG iddConfig;
    IDDCX_CLIENT_CONFIG_INIT(&iddConfig);
    iddConfig.EvtIddCxAdapterInitFinished = DuoDeskVddAdapterInitFinished;
    iddConfig.EvtIddCxParseMonitorDescription = DuoDeskVddParseMonitorDescription;
    iddConfig.EvtIddCxMonitorGetDefaultDescriptionModes = DuoDeskVddMonitorGetDefaultModes;
    iddConfig.EvtIddCxMonitorQueryTargetModes = DuoDeskVddMonitorQueryModes;
    iddConfig.EvtIddCxAdapterCommitModes = DuoDeskVddAdapterCommitModes;
    iddConfig.EvtIddCxMonitorAssignSwapChain = DuoDeskVddMonitorAssignSwapChain;
    iddConfig.EvtIddCxMonitorUnassignSwapChain = DuoDeskVddMonitorUnassignSwapChain;

    NTSTATUS status = IddCxDeviceInitConfig(pDeviceInit, &iddConfig);
    if (!NT_SUCCESS(status)) return status;

    WDF_OBJECT_ATTRIBUTES attr;
    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attr, IndirectDeviceContextWrapper);
    attr.EvtCleanupCallback = [](WDFOBJECT obj) {
        auto* p = WdfObjectGet_IndirectDeviceContextWrapper(obj);
        if (p) p->Cleanup();
    };

    WDFDEVICE device = nullptr;
    status = WdfDeviceCreate(&pDeviceInit, &attr, &device);
    if (!NT_SUCCESS(status)) return status;

    status = IddCxDeviceInitialize(device);
    auto* pContext = WdfObjectGet_IndirectDeviceContextWrapper(device);
    pContext->pContext = new IndirectDeviceContext(device);
    return status;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddDeviceD0Entry(WDFDEVICE device, WDF_POWER_DEVICE_STATE previousState)
{
    UNREFERENCED_PARAMETER(previousState);
    auto* pContext = WdfObjectGet_IndirectDeviceContextWrapper(device);
    pContext->pContext->InitAdapter();
    return STATUS_SUCCESS;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddAdapterInitFinished(IDDCX_ADAPTER adapterObject, const IDARG_IN_ADAPTER_INIT_FINISHED* pInArgs)
{
    auto* pContext = WdfObjectGet_IndirectDeviceContextWrapper(adapterObject);
    if (NT_SUCCESS(pInArgs->AdapterInitStatus))
    {
        pContext->pContext->FinishInit(0);
    }
    return STATUS_SUCCESS;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddAdapterCommitModes(IDDCX_ADAPTER adapterObject, const IDARG_IN_COMMITMODES* pInArgs)
{
    UNREFERENCED_PARAMETER(adapterObject);
    UNREFERENCED_PARAMETER(pInArgs);
    return STATUS_SUCCESS;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddParseMonitorDescription(const IDARG_IN_PARSEMONITORDESCRIPTION* pInArgs, IDARG_OUT_PARSEMONITORDESCRIPTION* pOutArgs)
{
    auto modes = LoadConfiguredModes();
    pOutArgs->MonitorModeBufferOutputCount = static_cast<UINT>(modes.size());
    if (pInArgs->MonitorModeBufferInputCount < modes.size())
    {
        return (pInArgs->MonitorModeBufferInputCount > 0) ? STATUS_BUFFER_TOO_SMALL : STATUS_SUCCESS;
    }
    for (size_t i = 0; i < modes.size(); ++i)
    {
        pInArgs->pMonitorModes[i] = CreateMonitorMode(modes[i].Width, modes[i].Height, modes[i].VSync, IDDCX_MONITOR_MODE_ORIGIN_MONITORDESCRIPTION);
    }
    pOutArgs->PreferredMonitorModeIdx = 0;
    return STATUS_SUCCESS;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddMonitorGetDefaultModes(IDDCX_MONITOR monitorObject, const IDARG_IN_GETDEFAULTDESCRIPTIONMODES* pInArgs, IDARG_OUT_GETDEFAULTDESCRIPTIONMODES* pOutArgs)
{
    UNREFERENCED_PARAMETER(monitorObject);
    auto modes = LoadConfiguredModes();
    pOutArgs->DefaultMonitorModeBufferOutputCount = static_cast<UINT>(modes.size());
    if (pInArgs->DefaultMonitorModeBufferInputCount < modes.size())
    {
        return (pInArgs->DefaultMonitorModeBufferInputCount > 0) ? STATUS_BUFFER_TOO_SMALL : STATUS_SUCCESS;
    }
    for (size_t i = 0; i < modes.size(); ++i)
    {
        pInArgs->pDefaultMonitorModes[i] = CreateMonitorMode(modes[i].Width, modes[i].Height, modes[i].VSync, IDDCX_MONITOR_MODE_ORIGIN_DRIVER);
    }
    pOutArgs->PreferredMonitorModeIdx = 0;
    return STATUS_SUCCESS;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddMonitorQueryModes(IDDCX_MONITOR monitorObject, const IDARG_IN_QUERYTARGETMODES* pInArgs, IDARG_OUT_QUERYTARGETMODES* pOutArgs)
{
    UNREFERENCED_PARAMETER(monitorObject);
    auto modes = LoadConfiguredModes();
    pOutArgs->TargetModeBufferOutputCount = static_cast<UINT>(modes.size());
    if (pInArgs->TargetModeBufferInputCount >= modes.size())
    {
        for (size_t i = 0; i < modes.size(); ++i)
        {
            pInArgs->pTargetModes[i] = CreateTargetMode(modes[i].Width, modes[i].Height, modes[i].VSync);
        }
    }
    return STATUS_SUCCESS;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddMonitorAssignSwapChain(IDDCX_MONITOR monitorObject, const IDARG_IN_SETSWAPCHAIN* pInArgs)
{
    auto* pContext = WdfObjectGet_IndirectMonitorContextWrapper(monitorObject);
    pContext->pContext->AssignSwapChain(pInArgs->hSwapChain, pInArgs->RenderAdapterLuid, pInArgs->hNextSurfaceAvailable);
    return STATUS_SUCCESS;
}

_Use_decl_annotations_
NTSTATUS DuoDeskVddMonitorUnassignSwapChain(IDDCX_MONITOR monitorObject)
{
    auto* pContext = WdfObjectGet_IndirectMonitorContextWrapper(monitorObject);
    pContext->pContext->UnassignSwapChain();
    return STATUS_SUCCESS;
}
