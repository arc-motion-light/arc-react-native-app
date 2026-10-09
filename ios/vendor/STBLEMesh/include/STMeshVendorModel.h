/**
 ******************************************************************************
 * @file    VendorModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    07-Mar-2018
 * @brief   Implementation of Vendor model
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
#import "STMeshBasicTypes.h"

typedef enum VendorModelMsgTypes_t : uint8_t {
    VendorModelMsgType_ReadRemoteData,
    VendorModelMsgType_SetRemoteDataReliable,
    VendorModelMsgType_SetRemoteData,
    VendorModelMsgType_Response,
    
    /* This Value is not part of Vendor model but provided by the SDK to ease App development. */
    VendorModelMsgType_Timeout  = 0xFF
} VendorModelMsgTypes;

@protocol STMeshVendorModelDelegate;

@interface STMeshVendorModel : NSObject

@property (nonatomic, weak) id<STMeshVendorModelDelegate> delegate;

/**
 * @brief  This method is used to send vendor command/data to element of a peer node.
 * @discussion The ST Vendor model allows to send data, with first byte used for Cmd sub code / Status.
 * @param1  peerAddress Address of the element to which the command is being sent.
 * @param2  opcode OpCode of the command being sent.
 * @param3  data Payload to be sent with the command. Data of upto 8 bytes of length is sent in single segment, larger data is sent in multiple segment.
 * @param4  responseFlag Indicates if a response is requested i.e. if it's a reliable command.
 * @return Result of the method execution.
 */
- (STMeshStatus) setRemoteData:(uint16_t)peerAddress usingOpcode:(uint32_t)opcode
                      sendData:(NSData*)data isResponseNeeded:(BOOL)responseFlag;

/**
 * @brief  This method is used to request data from an element of a peer node.
 * @discussion The ST Vendor model allows to receive data, with first byte used for Cmd sub code / Status.
 * @param1  peerAddress Address of the element to which the command is being sent.
 * @param2  opcode OpCode of the command being sent.
 * @param3  data NSData object to receive the data. Data of upto 8 bytes of length is received in single segment, larger data is received in multiple segment.
 * @return Result of the method execution.
 */
- (STMeshStatus) readRemoteData:(uint16_t)peerAddress usingOpcode:(uint8_t)opcode
                       sendData:(NSData*)data;

/* This method is used to send response to a data request from a element of peer node. */
/**
 * @brief  This method is used to send response to a command (readRemoteData) to element of a peer node.
 * @discussion The ST Vendor model allows to send data, with first byte used for Cmd sub code / Status.
 * @param1  peerAddress Address of the element to which the command is being sent.
 * @param2  opcode OpCode of the command being sent.
 * @param3  data Payload to be sent with the command. Data of upto 8 bytes of length is sent in single segment, larger data is sent in multiple segment.
 * @return Result of the method execution.
 */
- (STMeshStatus) sendResponse:(uint16_t)peerAddress usingOpcode:(uint8_t)opcode
                     sendData:(NSData*)data;

/**
 * @brief  This method is used to request version data from an element of a peer node.
 * @discussion The ST Vendor model allows to receive data, with first byte used for Cmd sub code / Status.
 * @param1  peerAddress Address of the element to which the command is being sent.
 * @param2  opcode OpCode of the command being sent.
 * @param3  data NSData object to receive the data. Data of upto 8 bytes of length is received in single segment, larger data is received in multiple segment.
 * @return Result of the method execution.
 */
- (STMeshStatus) readDeviceVersionData:(uint16_t)peerAddress usingOpcode:(uint8_t)opcode
                              sendData:(NSData*)data;
@end

@protocol STMeshVendorModelDelegate <NSObject>
@optional

/**
 * @brief  This callback is invoked when data is recived from an element of a peer node.
 * @discussion Callback is invoked when a command (with responseFlag set) is acknowledged or requested data is received
 * @param1  peerAddress Address of the element from which the data is being received.
 * @param2  opcode OpCode of the command.
 * @param3  data NSData object to receive the data. Data of upto 8 bytes of length is received in single segment, larger data is received in multiple segment.
 */
- (void) vendorModel:(STMeshVendorModel *)vendorModel didReceiveResponseFromAddress:(uint16_t)peerAddress
         usingOpcode:(uint8_t)opcode recvData:(NSData*)data;

@optional

/**
 * @brief  This callback is invoked when data is recived from an element of a peer node in promiscuous / sniffer mode .
 * @discussion Callback is invoked when a command (with responseFlag set) is acknowledged or requested data is received.
 *              This method is called in both cases
 *              1) When destinationAddr == OwnAddress
 *              2) When destinationAddr <> OwnAddress
 * @param1  sourceAddress Address of the element from which the command is being received.
 * @param2  destinationAddress Address of the element to which the command is being sent.
 * @param3  opcode OpCode of the command.
 * @param4  data NSData object to receive the data. Data of upto 8 bytes of length is received in single segment, larger data is received in multiple segment.
 */
- (void) vendorModel:(STMeshVendorModel *)vendorModel didReceiveMessageFromAddress:(uint16_t)sourceAddress toDestination:(uint16_t)destinationAddress
         usingOpcode:(uint8_t)opcode data:(NSData*)data msgType:(VendorModelMsgTypes)msgType;

@end

