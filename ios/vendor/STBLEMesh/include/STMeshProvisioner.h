/**
 ******************************************************************************
 * @file    STMeshProvisioner.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    19-Nov-2017
 * @brief   Provisioner API header file
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

#import <Foundation/Foundation.h>
#import "STMeshTypes.h"
#import "STMeshBasicTypes.h"
//#import "STMeshLoggerInterface.h"

@protocol STMeshProvisionerDelegate;
@interface STMeshProvisioner : NSObject
@property(nonatomic, weak)id<STMeshProvisionerDelegate> delegate;

/**
 * @brief  This method starts scanning for unprovisioned devices.
 * @discussion Scan for unprovisioned devices in the vicinity is started, "didDeviceAppearedWithUUID" is called whenever such a device is found.
 * @param1  timeOut parameter determines for how long the scanning for unprovisioned devices continues. In current release, this parameter has no effect.
 * @return Result of the method execution.
 */
- (STMeshStatus) startDeviceScan:(uint32_t)timeOut;


/**
 * @brief  This method stops scanning for unprovisioned devices .
 * @discussion Stop scan for unprovisioned devices in the vicinity.
 * @return Result of the method execution.
 */
- (STMeshStatus) stopDeviceScan;


//REVIEW {RC 1.03.000}: deviceAddress parameter does not seem to be used, can be removed.
/**
 * @brief  Method is called for provisionining an unprovisioned device in the vicinity.
 * @discussion This Method is used for provisioned a unprovisioned Device to your mesh Networks
 * @param1  node STMeshNode Object corresponding to the device to be provisioned. UUID field of the node object should be filled.
 * @param2  address  unicast address to be assigned to the device during provisioning.
 * @param3 duration time for which unprovisioned device would identify itself (e.g. by blinking LED).
 * @return Result of the method execution.
 */
- (STMeshStatus) provisionDevice:(STMeshNode *)node  deviceAddress:(uint16_t)address
              identificationTime:(uint32_t)duration;


/**
 * @brief Method is called for cancel Provisioning
 * @discussion This Method is used for cancelling provisioning.
 * @return Result of the method execution.
 */
-(STMeshStatus)cancelProvisioning;

/**
 * @brief  A Provisioner sends this PDU to indicate to the device that the provisioning process is starting.
 * @discussion This Method is used to send the invitation to the node in the vicinity
 * @param1  node STMeshNode Object corresponding to the device to be provisioned. UUID field of the node object should be filled.
 * @param2  attentionTimer  Attention Timer state.
 * @return Result of the method execution.
 */
-(STMeshStatus)sendProvisioningInvite:(STMeshNode *)node attentionTimer:(int)attentionTimer;
/**
 * @brief  This is to establish the GATT connection with the unprovisioned device.
 * @discussion This Method is used to connect the device on GATT in the vicinity
 * @param1  node STMeshNode Object corresponding to the device to be provisioned. UUID field of the node object should be filled.
 * @param2  attentionTimer  Attention Timer state.
 * @return Result of the method execution.
 */
//-(STMeshStatus)connectToProvisoner:(STMeshNode *)node;

-(STMeshStatus)connectProvisoner:(STMeshNode *)node attentionTimer:(uint16_t)attentionTimer;

/**
 * @brief  This is to send the provisioning confirmation command to the unprovisioned device.
 * @discussion This Method is used to send the provisioning confirmation to the device on GATT, after sending Start provisioning command.
 * @param1 provisioningAuthenticationValue Authentication Value which will be entered by the provisioner to device for OOB provisioning.
 * @return Result of the method execution.
 */
-(STMeshStatus)sendProvisioningConfirmationWithAuth:(NSData*)provisioningAuthenticationValue;

/**
 * @brief  This is to start the provisioning with the unprovisioned device.
 * @discussion A Provisioner sends this PDU to indicate the method it has selected from the options in the Provisioning Capabilities PDU, after sending provision device command.
 * @param1  node STMeshNode Object corresponding to the device to be provisioned. UUID field of the node object should be filled.
 * @param2 algorithmUsed The algorithm used for provisioning
 * @param3 publicKey Public Key used
 * @param4 authenticationMethod Method used to indicate whethe provisioning is intiated with OOB or not.
 * @param5 authenticationAction Action which is to be used for provisioning. For Ex beep , numeric , alphanumeric and vibrate etc
 * @param6 authenticationSize Size of the authentication value
 * @param7 publicKeyData  64 bytes data array of Public Key
 * @return Result of the method execution.
 */
-(STMeshStatus)startProvisioningWithOOBInputs:(STMeshNode *)node algorithmUsed:(uint8_t)algorithmUsed publicKey:(uint8_t) publicKey  authenticationMethod:(uint8_t) authenticationMethod  authenticationAction:(uint8_t) authenticationAction  authenticationSize:(uint8_t) authenticationSize publicKeyValue :(NSData *)publicKeyData;

@end

@protocol STMeshProvisionerDelegate <NSObject>


@optional
/**
 * @brief  Called during the provisioning process, to update the status.
 * @discussion Percentage 100% means configuration stage is completed.
 * @param1  provisioner Reference of the provisioner object calling this method.
 * @param2  percentage  Provisioning progress in percent.
 * @param3 message String related to the current provisioning stage.
 * @param4 error Flag to notify if provisioning process encounters error.
 */
- (void) provisioner:(STMeshProvisioner *)provisioner didProvisionStageChanged:(int32_t)percentage
       updateMessage:(NSString *)message hasError:(BOOL)error;

@optional
/**
 * @brief  Called during the provisioning process, to notify the device capabilities.
 * @discussion Method is called as soon as device capabilites message is received from the device under provisioning.
 * @param1  provisioner Reference of the provisioner object calling this method.
 * @param2  elementCount  as reported by the device in the capabilities message.
 */
- (void)provisioner:(STMeshProvisioner *)provisioner didReceiveCapabilitesElementCount:(uint8_t)elementCount publicKeyType:(uint8_t) publicKeyType staticOobType: (uint8_t) staticOobType outputOobSz:(uint8_t) outputOobSz  outputOobAction:(uint16_t) outputOobAction inputOobSz: (uint8_t) inputOobSz inputOobAction:(uint16_t) inputOobAction;


@optional
/**
 * @brief  Called during unprovisioned device scan.
 * @discussion This callback is invoked when advertisement packet from unprovisioned device is received. This is used for updating the unprovisioned device scan UI, rssi values can be updated in real time using this callback.
 * @param1  provisioner Reference of the provisioner object calling this method.
 * @param2  uuid  UUID of the unprovisioned device found during the scan.
 * @param3 rssi value of the advertisement message received from the unprovisioned device.
 */
- (void) provisioner:(STMeshProvisioner *)provisioner didDeviceAppearedWithUUID:(NSString*)uuid
                deviceName :(NSString*)deviceName RSSI:(int32_t)rssi;

/**
 * @brief  On Receiving Public key status.
 * @discussion This callback is invoked when provisioning public Key excahnge status is received.
 */
- (void) provisioner:(STMeshProvisioner *)provisionerOnRecieveProvisioningPublicKeyExchageStatus;

/**
 * @brief  On Receiving provisoner is connected with device status.
 * @discussion This callback is invoked when provisioner has establised connection status is received.
 */
@optional
-(void) provisioner:(STMeshProvisioner *)provisioner provisionerDidConnectToDevice:(NSString *)strDeviceName;

/**
 * @brief  On Receiving the Input From device is completed status.
 * @discussion This callback is invoked when input is completed from unprovisioned device status is received.
 * @param1  provisioner Reference of the provisioner object calling this method.
 */
@optional
-(void) provisionerOnRecievingProvisioningInputCompleteStatus:(STMeshProvisioner *)provisioner;

/**
 * @brief  On Receiving the provisioning failed status.
 * @discussion This callback is invoked when provisioning failed.
 * @param1  provisioner Reference of the provisioner object calling this method.
 */
@optional
-(void) provisionerOnRecievingProvisioningFailedStatus:(STMeshProvisioner *)provisioner;
@end
