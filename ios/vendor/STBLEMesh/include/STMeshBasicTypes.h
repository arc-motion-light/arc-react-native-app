/**
 ******************************************************************************
 * @file    STMeshBasicTypes.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    21-Jul-2017
 * @brief   Basic types used in the SDK
 ******************************************************************************
 * @attention
 *
 * <h2><center>&copy; COPYRIGHT(c) 2019 STMicroelectronics</center></h2>
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *   1. Redistributions of source code must retain the above copyright notice,
 *      this list of conditions and the following disclaimer.
 *   2. Redistributions in binary form must reproduce the above copyright notice,
 *      this list of conditions and the following disclaimer in the documentation
 *      and/or other materials provided with the distribution.
 *   3. Neither the name of STMicroelectronics nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 ******************************************************************************
 */

#ifndef STMeshBasicTypes_h
#define STMeshBasicTypes_h
typedef long long timestamp_t;

typedef enum {
    STMeshDeviceTypes_Unknown = 0x0000FFFF,
    STMeshDeviceTypes_Light = 0x00000000,
    STMeshDeviceTypes_Accelerometer = 0x00000001,
    STMeshDeviceTypes_Thermometer = 0x00000002,
}STMeshDeviceTypes;

typedef enum {
    STMeshStatus_Success = 0,       /* Operation completed successfully. */
    STMeshStatus_False = 1,         /* Operation did not happen but no error occured. */
    STMeshStatus_Fail = 2,          /* Error occured in executing the operation. */
    STMeshStatus_InvalidArg = 3,    /* Invalid data supplied. */
    STMeshStatus_OutOfMemory = 4,   /* Out of memory. */
    STMeshStatus_Timeout = 5,       /* Operation timed-out. */
    STMeshStatus_NoConnection = 6,  /* Bearer connection not available to communicate. */
    STMeshStatus_NoBLE = 7,         /* Bearer not present. */
    
}STMeshStatus;

typedef enum {
    STMeshCmdStatus_Success = 0,    /* Command has been executed sucessfully. */
    STMeshCmdStatus_FailCmd = 1,    /* Command failed as it has illegal OpCode. */
    STMeshCmdStatus_FailAddr = 2,   /* Command failed as it contains illegal address. */
    STMeshCmdStatus_FailValue = 3,  /* Command failed as it contains illegal data value. */
    STMeshCmdStatus_FailDevice = 4, /* Command failed due to error at destination device. */
    STMeshCmdStatus_FailTimeout = 5,/* Command failed as expected ack/response was not received */
    STMeshCmdStatus_GattSent = 6    /* Ack for the packet sent over GATT */
}STMeshCmdStatus;

typedef enum {
    STMeshMode_Provisioner = 0x00,  /* Mesh device in Provisioner role. */
    STMeshMode_ProxyClient = 0x01,  /* Mesh device in Proxy client role. */
    STMeshMode_Offline = 0xFF       /* Mesh device in offline mode. */
}STMeshMode;


typedef enum {
    STMeshBleRadioState_Unknown,     /* The state of the BLE Manager is unknown. */
    STMeshBleRadioState_Unsupported, /* This device does not support Bluetooth Low Energy. */
    STMeshBleRadioState_Unauthorized,/* This app is not authorized to use Bluetooth Low Energy. */
    STMeshBleRadioState_PoweredOff,  /* Bluetooth on this device is currently powered off. */
    STMeshBleRadioState_PoweredOn    /* Bluetooth LE is turned on and ready for communication. */
} STMeshBleRadioState;


typedef enum {
    STMeshKeysOperationState_Success = 0,     /* The state of the BLE Manager is unknown. */
    STMeshKeysOperationState_Fail = 1, /* This device does not support Bluetooth Low Energy. */
    STMeshKeysOperationState_FailDuplicateKeyIndex = 2,/* This app is not authorized to use Bluetooth Low Energy. */
    STMeshKeysOperationState_WrongKeyIndex = 3,  /* Bluetooth on this device is currently powered off. */

} STMeshKeysOperationState;





/* Following snippet disables the SDK logs in Release builds */
#ifdef DEBUG
#   define NSLog(...) NSLog(__VA_ARGS__)
#else
#   define NSLog(...) (void)0
#endif


#endif /* STMeshBasicTypes_h */
