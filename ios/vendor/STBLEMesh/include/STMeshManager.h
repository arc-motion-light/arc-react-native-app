/**
 ******************************************************************************
 * @file    STMeshManager.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    30-Jun-2017
 * @brief   ST BLE Mesh Library for iOS main API header file
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

#ifndef STMeshManager_h
#define STMeshManager_h

#import "STMeshTypes.h"
#import "STMeshConfigurationModel.h"
#import "STMeshGenericModel.h"
#import "STMeshVendorModel.h"
#import "STMeshProvisioner.h"
#import "STMeshLightingModel.h"
#import "STMeshHealthModel.h"
#import "STMeshHeartbeatModel.h"
#import "STMeshHeartbeatControlModel.h"
#import "STMeshLogger.h"
#import "STMeshSensorModel.h"
#import "STMeshTimeAndSceneModel.h"
//#import "STMeshLCModeModel.h"

/* Forward declaration */
@protocol STMeshManagerDelegate;

@interface STMeshManager:NSObject

@property (nonatomic, weak) id<STMeshManagerDelegate> delegate;

+ (instancetype)getInstance:(id<STMeshManagerDelegate>)delegateObj;


/**
 * @brief  Method returns instance of configuration model client.
 * @discussion Method returns instance of configuration model client.
 * @return Instance of configuration model client.
 */
- (STMeshConfigurationModel *)getConfigurationModel;

/**
 * @brief  Method returns instance of logger client.
 * @discussion Method returns instance of logger client.
 * @return Instance of logger client.
 */
- (STMeshLogger *)getLogger;

/**
 * @brief  Method returns instance of vendor model client.
 * @discussion Method returns instance of vendor model client.
 * @return Instance of vendor model client.
 */
- (STMeshVendorModel *)getVendorModel;

/**
 * @brief  Method returns instance of generic model client.
 * @discussion Method returns instance of generic model client.
 * @return Instance of generic model client.
 */
-(STMeshGenericModel *)getGenericModel;

/**
 * @brief  Method returns instance of Lighting model client.
 * @discussion Method returns instance of Lighting model client.
 * @return Instance of Lighting model client.
 */
-(STMeshLightingModel *)getLightingModel;

/**
 * @brief  Method returns instance of Health model client.
 * @discussion Method returns instance of Health model client.
 * @return Instance of Health model client.
 */
-(STMeshHealthModel *)getHealthModel;

/**
 * @brief  Method returns instance of sensor model client.
 * @discussion Method returns instance of sensor model client.
 * @return Instance of sensor model client.
 */
-(STMeshSensorModel *)getSensorModel;

/**
 * @brief  Method returns instance of Heartbeat configuration client.
 * @discussion Method returns instance of Heartbeat configuration client.
 * @return Instance of Heartbeat configuration client.
 */
-(STMeshHeartbeatModel *)getHeartbeatModel;

/*Get Instance of Heartbeat model Client*/
/**
 * @brief  Method returns instance of Heartbeat client.
 * @discussion Method returns instance of Heartbeat client.
 * @return Instance of Heartbeat client.
 */
-(STMeshHeartbeatControlModel *)getFeatureHeartbeatModel;

/**
 * @brief  Method returns instance of LCMode model client.
 * @discussion Method returns instance of LCMode model client.
 * @return Instance of LCMode model client.
// */
//-(STMeshLCModeModel *)getLCModeModel;

/**
 * @brief  Method returns instance of Time And Scene client.
 * @discussion Method returns instance of Time And Scene but currently only scene api's are implemented in client.
 * @return Instance of TimeAndScene client.
 */
-(STMeshTimeAndSceneModel *)getTimeAndSceneModel;

/**
 * @brief  Method returns instance of provisioning client.
 * @discussion Method returns instance of provisioning client. All provisioing related functionality is accessed using this class.
 * @return Instance of provisioning client.
 */
-(STMeshProvisioner *)getProvisioner;

/**
 * @brief  This method returns current status of BLE.
 * @discussion This method returns current status of BLE.
 * @return Status of the BLE radio.
 */


- (STMeshBleRadioState) getBleState;

/**
 * @brief  This method initializes the Mesh stack.
 * @discussion The method must be called during the startup, before calling any MeshManager function.
 * @param1  address sets the unicast address used by the provisioner.
 * @return Result of the method execution.
 */
- (STMeshStatus) createNetwork:(uint16_t) address;

/**
 * @brief  This method start or resume mesh network processing.
 * @discussion The method must be called to connect to available proxy node and start processing the mesh messages.
 * @param1  preferredProxyAddress is the unicast address of the proxy to which the proxy client tries to connect.
 *          -> proxyAddress == 0, provisioner would connect to proxy node using NetworkID i.e. it would connect to any node in range.
 *          -> proxyAddress <> 0, provisioner would connect to proxy node using NodeIdentity i.e. it would connect to node with specified unicast address in range, if the connection via "Node Identity" fails, the proxy client reverts to connection using NetworkID.
 * @return Result of the method execution.
 */
- (STMeshStatus) startNetwork:(uint16_t)preferredProxyAddress;

/**
 * @brief  This method stops mesh network processing.
 * @discussion Can be called to save power for example.
 * @return Result of the method execution.
 */
- (STMeshStatus) stopNetwork;

/**
 * @brief  This method is used to provide the Network & security information to the underlying mesh stack.
 * @discussion Network data is critical for proper operation of Mesh network. User application is responsible for retrieving this data at the application start and saving it at application shutdown. If this data is lost, the network would have to re-created from scratch.
 * @param1  networkSettings STMeshNetworkSettings Object containing the mesh network configuration.
 * @return Result of the method execution.
 */
- (STMeshStatus) setNetworkData:(STMeshNetworkSettings *) networkSettings;

/**
 * @brief  This method is is used to retrieve network state data from the underlying library.
 * @discussion The network state must be saved by user, before exiting the App, and restore when the application is opened again, If this data is lost some aspects of network operation and security may be impacted temporarily.
 * @param1  stateData in form of NSData, This data is opaque for user application.
 * @return Result of the method execution.
 */
- (STMeshStatus) saveNetworkState:(NSData *)stateData;

/**
 * @brief  This method is is used to restore network state.
 * @discussion Network state can be restored, from network state data saved in the storage.
 * @param1  stateData in form of NSData, provided by the user application.
 * @return Result of the method execution.
 */
- (STMeshStatus) restoreNetworkState:(NSData *)stateData;

/**
 * @brief  This method is is used to enbale Promiscuous/Sniffer Mode.
 * @discussion When Promiscuous Mode is enabled, the SDK accepts messages from all nodes in network, including messages not destined to own unicast/group address.
 * @param1  enableFlag If flag == true, the promiscuous mode is enabled.
 * @return Result of the method execution.
 */
- (STMeshStatus) enablePromiscuousMode:(BOOL )enableFlag;

/**
 * @brief  This method returns the current connection status of the proxy.
 * @discussion The method determines if an active connection to a proxy node exists.
 * @return Status of the proxy connection.
 */
-(BOOL)isConnectedToProxyService;


/**
 * @brief This Method used to set current app key for a commond.
 * @discussion this method used rto call every time we are sending commend with diffrent appkey index then last command.
 * @param1  appKeyIndex current app key index.
 */

-(void)setCurrentAppKeyIndex:(UInt16)appKeyIndex;

/**
 * @brief  This method enables/disbles the dummy mode operation.
 * @discussion Dummy mode allows developers to test their apps made using the ST BLE Mesh iOS SDK, even when they may not have access to the physical mesh nodes.
 * @param1  dummyMode If flag == true, the dummy mode is enabled.
 */


-(void)setDummyMode:(BOOL)dummyMode;


/**
 * @brief This Method used to set current Default  TTL Value.
 * @discussion this method used to call. when need to change Network default TTL value.
 * @param1  value new  TTL value.
 */
-(void)setCurrentNetworkTTLValue:(UInt8)value;

-(void)sendSecureNetworkBeacon;
@end


@protocol STMeshManagerDelegate <NSObject>

@optional

/**
 * @brief  This callback is invoked when status of Bluetooth LE radio on iOS device changes.
 * @discussion Also invoked when STMeshManager is instantiated.
 * @param1  status Current state of the BLE connection.
 */
- (void) meshManager:(STMeshManager *)manager didBTStateChange:(STMeshBleRadioState)status;


@optional
/**
 * @brief  This callback is invoked when status of the proxy node connection changes.
 * @discussion The method is called when the proxy client connects to a proxy node, or disconnects from a Proxy node. The call is usually folowed by callback didProxyNodeAddressRetrieved.
 */
- (void) meshManager:(STMeshManager *)manager didProxyConnectionChanged:(BOOL)isConnected;

@optional  // TODO: make it required in the next release.

/**
 * @brief  This callback is invoked to inform user application about error condition in mesh library.
 * @discussion Method notifies an error in the Mesh library.
 * @param1  errMessage Text description of the error.
 */
- (void) meshManager:(STMeshManager *)manager didErrorOccurred:(NSString *)errMessage;

/**
 * @brief  This callback is invoked when proxy switches from one node to another.
 * @discussion After connection to a proxy node is established, proxy client attempts to identify the unicast address of the proxy node, once the node is identified, this callback is called. Note: Generic on/off must be implemented on the node in order for this mechanism to work.
 * @param1  strUUID Mesh UUID of the current proxy node.
 * @param2  peerAddress  Unicast address of the current proxy node.
 */
- (void)meshManager:(STMeshManager*)manager didProxyNodeAddressRetrieved:(NSString *)strUUID peerAddress:(uint16_t)peerAddress;


@end
#endif /* STMeshManager_h */

