// DuoDesk Virtual Display Driver — IddCx (UMDF 2.x) ARM64 / x64
// Copyright (C) 2026 DuoDesk Contributors. GPL-3.0, see LICENSE.
#pragma once

#define NOMINMAX
#define WIN32_NO_STATUS
#include <windows.h>
#undef WIN32_NO_STATUS
#include <ntstatus.h>
#include <bugcodes.h>
#include <wudfwdm.h>
#include <wdf.h>
#include <iddcx.h>

#include <dxgi1_5.h>
#include <d3d11_2.h>
#include <avrt.h>
#include <wrl.h>

#include <memory>
#include <vector>
#include <string>

namespace DuoDesk::Vdd
{
    struct DisplayModeSpec
    {
        DWORD Width;
        DWORD Height;
        DWORD VSync;
    };

    // Direct3D 11 device wrapper bound to the system GPU (Adreno ARM64, NVIDIA, AMD, Intel)
    class Direct3DDevice
    {
    public:
        explicit Direct3DDevice(LUID adapterLuid);
        Direct3DDevice();
        HRESULT Init();

        LUID AdapterLuid;
        Microsoft::WRL::ComPtr<IDXGIFactory5> DxgiFactory;
        Microsoft::WRL::ComPtr<IDXGIAdapter1> Adapter;
        Microsoft::WRL::ComPtr<ID3D11Device> Device;
        Microsoft::WRL::ComPtr<ID3D11DeviceContext> DeviceContext;
    };

    // Asynchronous GPU swap-chain frame processor
    class SwapChainProcessor
    {
    public:
        SwapChainProcessor(IDDCX_SWAPCHAIN swapChain, std::shared_ptr<Direct3DDevice> device, HANDLE newFrameEvent);
        ~SwapChainProcessor();

    private:
        static DWORD CALLBACK RunThread(LPVOID arg);
        void Run();
        void RunCore();

        IDDCX_SWAPCHAIN m_hSwapChain;
        std::shared_ptr<Direct3DDevice> m_Device;
        HANDLE m_hAvailableBufferEvent;
        Microsoft::WRL::Wrappers::HandleT<Microsoft::WRL::Wrappers::HandleTraits::HANDLENullTraits> m_hThread;
        Microsoft::WRL::Wrappers::HandleT<Microsoft::WRL::Wrappers::HandleTraits::HANDLENullTraits> m_hTerminateEvent;
    };

    class IndirectMonitorContext
    {
    public:
        explicit IndirectMonitorContext(_In_ IDDCX_MONITOR monitor);
        ~IndirectMonitorContext();

        void AssignSwapChain(IDDCX_SWAPCHAIN swapChain, LUID renderAdapter, HANDLE newFrameEvent);
        void UnassignSwapChain();

    private:
        IDDCX_MONITOR m_Monitor;
        std::unique_ptr<SwapChainProcessor> m_ProcessingThread;
    };

    class IndirectDeviceContext
    {
    public:
        explicit IndirectDeviceContext(_In_ WDFDEVICE wdfDevice);
        ~IndirectDeviceContext();

        void InitAdapter();
        void FinishInit(UINT connectorIndex);

        WDFDEVICE m_WdfDevice;
        IDDCX_ADAPTER m_Adapter;
    };

    std::vector<DisplayModeSpec> LoadConfiguredModes();
}

struct IndirectDeviceContextWrapper
{
    DuoDesk::Vdd::IndirectDeviceContext* pContext;
    void Cleanup()
    {
        delete pContext;
        pContext = nullptr;
    }
};

struct IndirectMonitorContextWrapper
{
    DuoDesk::Vdd::IndirectMonitorContext* pContext;
    void Cleanup()
    {
        delete pContext;
        pContext = nullptr;
    }
};

WDF_DECLARE_CONTEXT_TYPE(IndirectDeviceContextWrapper);
WDF_DECLARE_CONTEXT_TYPE(IndirectMonitorContextWrapper);
